import { it, expect, vi, describe } from "vitest";
import { run, type Core } from "../src/action.js";
import { raw } from "./fixtures.js";
import { harness, token } from "./harness.js";
import { validateEvent, context, event } from "../src/notification.js";
import { Sanitizer } from "../src/security.js";
import { initialResult } from "../src/result.js";
export function fakeCore(overrides: Record<string, string> = {}) {
  const outputs: Record<string, string> = {};
  const calls: string[] = [];
  const summary = { addRaw: vi.fn(), write: vi.fn(async () => {}) };
  const core = {
    getInput: vi.fn((n: string) => overrides[n] ?? raw[n] ?? ""),
    setSecret: vi.fn(),
    setOutput: vi.fn((k: string, v: string) => {
      calls.push(k);
      outputs[k] = v;
    }),
    setFailed: vi.fn(() => {
      calls.push("failed");
    }),
    info: vi.fn(),
    warning: vi.fn(),
    summary,
  } as unknown as Core;
  return { core, outputs, calls };
}
const create = { code: "synthetic.1" };
const env = {
  GITHUB_REPOSITORY: "synthetic/example",
  GITHUB_RUN_ID: "123",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_REF: "refs/heads/main",
  GITHUB_SHA: "a".repeat(40),
  GITHUB_ACTOR: "synthetic",
  GITHUB_WORKFLOW: "Build",
  GITHUB_JOB: "build",
};
describe("orchestration, polling, outputs and notification events", () => {
  it.each([
    ["SUCCESS", "success", undefined],
    ["FAIL", "failure", "BUILD_FAILED"],
    ["DELETED", "cancelled", "BUILD_DELETED"],
    ["UNKNOWN", "internal-error", "BUILD_UNKNOWN_STATUS"],
  ])("maps %s", async (status, outcome, code) => {
    const h = harness([
      token,
      create,
      { buildStatus: "SCHEDULED", percentage: 0 },
      { buildStatus: "BUILDING", percentage: 40 },
      {
        buildStatus: status,
        percentage: 95,
        errorMessage:
          status === "FAIL" ? "Synthetic compilation error" : undefined,
      },
    ]);
    const c = fakeCore();
    const r = await run(c.core, h.rt, env);
    expect(r.outcome).toBe(outcome);
    expect(r.error?.code).toBe(code);
    expect(c.outputs["build-status"]).toBe(status);
    expect(c.outputs["build-percentage"]).toBe("95");
    expect(c.outputs["poll-count"]).toBe("3");
    expect(c.outputs["duration-ms"]).toBe("120000");
    const e = JSON.parse(c.outputs["notification-event"]!);
    expect(validateEvent(e)).toBe(true);
    expect(e.status).toBe(outcome);
    expect(e.data).not.toHaveProperty("pollCount");
    expect(e.context.runUrl).toBe(
      "https://github.com/synthetic/example/actions/runs/123",
    );
    if (code) expect(c.calls.at(-1)).toBe("failed");
    else expect(c.core.setFailed).not.toHaveBeenCalled();
  });
  it("preserves last percentage on timeout without claiming remote failure", async () => {
    const h = harness([
      token,
      create,
      { buildStatus: "BUILDING", percentage: 35 },
    ]);
    const c = fakeCore({ "timeout-minutes": "1" });
    const r = await run(c.core, h.rt);
    expect(r).toMatchObject({
      timedOut: true,
      buildCode: "synthetic.1",
      buildStatus: "BUILDING",
      percentage: 35,
      error: { code: "BUILD_WAIT_TIMEOUT" },
      outcome: "internal-error",
    });
    expect(validateEvent(JSON.parse(c.outputs["notification-event"]!))).toBe(
      true,
    );
  });
  it("does not fabricate success percentage and suppresses repeated status logs", async () => {
    const h = harness([
      token,
      create,
      { buildStatus: "BUILDING" },
      { buildStatus: "BUILDING" },
      { buildStatus: "SUCCESS" },
    ]);
    const c = fakeCore();
    await run(c.core, h.rt);
    expect(c.outputs["build-percentage"]).toBe("");
    expect(c.core.info).toHaveBeenCalledTimes(6);
  });
  it.each([
    ["auth", [Response.json({}, { status: 401 })], "AUTHENTICATION_FAILED"],
    [
      "create",
      [token, Response.json({}, { status: 400 })],
      "CREATE_BUILD_FAILED",
    ],
    [
      "progress",
      [token, create, Response.json({}, { status: 403 })],
      "BUILD_PROGRESS_FAILED",
    ],
    [
      "unexpected",
      [new Error("PRIVATE_RAW_ERROR"), new Error(), new Error()],
      "REQUEST_FAILED",
    ],
  ])("emits failure outputs for %s", async (_name, responses, code) => {
    const h = harness(responses as object[]);
    const c = fakeCore();
    const r = await run(c.core, h.rt);
    expect(r.error?.code).toBe(code);
    expect(validateEvent(JSON.parse(c.outputs["notification-event"]!))).toBe(
      true,
    );
    expect(c.calls.at(-1)).toBe("failed");
    expect(JSON.stringify(c.outputs)).not.toContain("PRIVATE_RAW_ERROR");
  });
  it("handles invalid inputs and unexpected failures with a valid minimal event", async () => {
    for (const unexpected of [true, false]) {
      const c = fakeCore({ branch: "" });
      if (unexpected)
        vi.mocked(c.core.getInput).mockImplementation(() => {
          throw new Error("secret");
        });
      const h = harness([]);
      const r = await run(c.core, h.rt);
      expect(r.error?.code).toBe(
        unexpected ? "INTERNAL_ERROR" : "INVALID_INPUT",
      );
      expect(c.outputs["build-status"]).toBe("");
      expect(validateEvent(JSON.parse(c.outputs["notification-event"]!))).toBe(
        true,
      );
      expect(h.fetcher).not.toHaveBeenCalled();
    }
  });
  it("removes synthetic secret markers from all public sinks and serializable errors", async () => {
    const markers = Object.values(raw).slice(0, 4);
    const h = harness([
      token,
      create,
      {
        buildStatus: "FAIL",
        errorMessage:
          markers.join(" ") + " " + token.access_token + " <script>x</script>",
      },
    ]);
    const c = fakeCore({ "build-name": "<b>" + raw["client-secret"] + "</b>" });
    await run(c.core, h.rt);
    const sinks = JSON.stringify([
      c.outputs,
      vi.mocked(c.core.info).mock.calls,
      vi.mocked(c.core.warning).mock.calls,
      vi.mocked(c.core.setFailed).mock.calls,
      vi.mocked(c.core.summary.addRaw).mock.calls,
    ]);
    for (const s of [...markers, token.access_token])
      expect(sinks).not.toContain(s);
    expect(sinks).not.toContain("<script>");
  });
  it("summary failure does not prevent failure outputs", async () => {
    const c = fakeCore();
    vi.mocked(c.core.summary.write).mockRejectedValue(new Error("secret"));
    const h = harness([token, create, { buildStatus: "FAIL" }]);
    await run(c.core, h.rt);
    expect(c.core.warning).toHaveBeenCalledWith(
      "The step summary could not be written.",
    );
    expect(c.calls.at(-1)).toBe("failed");
  });
  it("attempts minimal fallback if output publishing throws", async () => {
    const c = fakeCore();
    vi.mocked(c.core.setOutput).mockImplementationOnce(() => {
      throw Error();
    });
    await run(c.core, harness([token, create, { buildStatus: "SUCCESS" }]).rt);
    expect(c.outputs["notification-event"]).toContain("internal-error");
    expect(c.calls.at(-1)).toBe("failed");
  });
  it("fails safely if even fallback output cannot be written", async () => {
    const c = fakeCore();
    vi.mocked(c.core.setOutput).mockImplementation(() => {
      throw Error("secret");
    });
    await run(c.core, harness([token, create, { buildStatus: "SUCCESS" }]).rt);
    expect(c.core.setFailed).toHaveBeenCalledWith(
      "The Action could not publish its result.",
    );
  });
  it("handles runner cancellation without deleting build", async () => {
    const c = fakeCore();
    const h = harness([]);
    const a = new AbortController();
    a.abort();
    const r = await run(c.core, h.rt, {}, a.signal);
    expect(r.error?.code).toBe("ACTION_CANCELLED");
    expect(h.fetcher).not.toHaveBeenCalled();
  });
});
it("context rejects unsafe fields and URLs, ignores full event payload", () => {
  const s = new Sanitizer(() => {});
  s.add("FAKE_SECRET");
  expect(
    context(
      {
        GITHUB_WORKFLOW: "FAKE_SECRET",
        GITHUB_ACTOR: "a\n",
        GITHUB_SERVER_URL: "http://unsafe",
        GITHUB_EVENT_PATH: "/private/file",
      },
      s,
    ),
  ).toEqual({});
  expect(
    context({ GITHUB_REPOSITORY: "../../bad", GITHUB_RUN_ID: "1" }, s),
  ).not.toHaveProperty("runUrl");
  expect(
    context(
      { GITHUB_REPOSITORY: "fake/repo", GITHUB_RUN_ID: "not-numeric" },
      s,
    ),
  ).not.toHaveProperty("runUrl");
});
it("rejects invalid generated event instead of emitting incompatible contract", () => {
  expect(() =>
    event({ ...initialResult(), durationMs: -1 }, {}, new Sanitizer(() => {})),
  ).toThrow();
});
it("aborts an in-flight request at the overall timeout and preserves timeout semantics", async () => {
  vi.useFakeTimers();
  try {
    const c = fakeCore({ "timeout-minutes": "1" });
    const h = harness([]);
    h.rt.fetch = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );
    const pending = run(c.core, h.rt);
    await vi.advanceTimersByTimeAsync(60000);
    expect(await pending).toMatchObject({
      timedOut: true,
      error: { code: "BUILD_WAIT_TIMEOUT" },
    });
  } finally {
    vi.useRealTimers();
  }
});
it("includes supplied application and escapes summary text", async () => {
  const c = fakeCore({
    "application-code": "synthetic-app",
    branch: "<img src=x>",
  });
  const r = await run(
    c.core,
    harness([token, create, { buildStatus: "SUCCESS" }]).rt,
  );
  expect(r.applicationCode).toBe("synthetic-app");
  expect(
    JSON.stringify(vi.mocked(c.core.summary.addRaw).mock.calls),
  ).not.toContain("<img");
});
it("preserves percentage when a later successful progress omits it", async () => {
  const c = fakeCore();
  const r = await run(
    c.core,
    harness([
      token,
      create,
      { buildStatus: "BUILDING", percentage: 42 },
      { buildStatus: "SUCCESS" },
    ]).rt,
  );
  expect(r.percentage).toBe(42);
});
