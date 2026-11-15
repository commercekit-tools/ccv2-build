import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseNotificationEventJson } from "@commercekit-tools/notification-contract";
import { run } from "../src/action.js";
import { readInputs } from "../src/inputs.js";
import * as notification from "../src/notification.js";
import * as reporting from "../src/reporting.js";
import { initialResult } from "../src/result.js";
import { Sanitizer } from "../src/security.js";
import { raw } from "./fixtures.js";
import { harness, token } from "./harness.js";
import { fakeCore } from "./action-core.js";

afterEach(() => vi.restoreAllMocks());
const workflow = {
  GITHUB_REPOSITORY: "synthetic/example",
  GITHUB_RUN_ID: "123",
};
const replies = (status = "SUCCESS") => [
  token,
  { code: "synthetic.1" },
  { buildStatus: status },
];
const authentication = [
  "token-endpoint",
  "client-id",
  "client-secret",
  "resource",
];
function settings(values: Record<string, string> = raw, validated = true) {
  const safe = new Sanitizer(() => {});
  authentication.forEach((name) => safe.add(values[name] ?? ""));
  return {
    safe,
    context: reporting.inputContext(
      values,
      validated ? readInputs((name) => values[name] ?? "", safe) : undefined,
      safe,
    ),
  };
}
function parse(text: string) {
  const value = parseNotificationEventJson(text);
  if (value.eventType !== "ccv2.build.completed")
    throw Error("Expected build event.");
  return value;
}
function rendered(c: ReturnType<typeof fakeCore>) {
  return vi
    .mocked(c.core.summary.addRaw)
    .mock.calls.map(([text]) => text)
    .join("");
}

describe("consistent build reporting", () => {
  it("covers every declared Action input with explicit authentication confidentiality", () => {
    const inputYaml = readFileSync("action.yml", "utf8")
      .split("\ninputs:\n")[1]!
      .split("\noutputs:\n")[0]!;
    const names = [...inputYaml.matchAll(/^ {2}([a-z-]+):$/gm)].map(
      (match) => match[1],
    );
    expect(reporting.inputDefinitions.map((input) => input.name)).toEqual(
      names,
    );
    expect(names).toHaveLength(11);
    expect(
      reporting.inputDefinitions
        .filter((input) => input.confidential)
        .map((input) => input.name),
    ).toEqual(authentication);
  });
  it("reports defaults, all fields and four redaction markers in the shared schema", () => {
    const { context, safe } = settings();
    expect(context.inputsValidated).toBe(true);
    expect(context.inputsTruncated).toBe(false);
    expect(context.inputs).toMatchObject({
      "poll-interval-seconds": "60",
      "timeout-minutes": "120",
      branch: "feature/test",
    });
    expect(context.inputs["api-base-url"]).toMatch(
      /^https:\/\/portalapi\.commerce\.ondemand\.com\/?$/,
    );
    for (const name of authentication)
      expect(context.inputs[name]).toBe("[REDACTED]");
    expect(Object.keys(context.inputs)).toHaveLength(11);
    const event = notification.event(
      { ...initialResult(), outcome: "success", ...context },
      workflow,
      safe,
    );
    expect(parse(JSON.stringify(event)).data).toMatchObject(context);
  });
  it("projects exact application and overridden validated policy values", () => {
    const { context } = settings({
      ...raw,
      "application-code": "synthetic-app",
      "poll-interval-seconds": "20",
      "timeout-minutes": "8",
    });
    expect(context.inputs).toMatchObject({
      "application-code": "synthetic-app",
      "poll-interval-seconds": "20",
      "timeout-minutes": "8",
    });
  });
  it("sanitizes rejected settings, known secrets, JWTs and long values before reporting", () => {
    const secret = "SYNTHETIC_INPUT_SECRET_123";
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c2lnbmF0dXJl";
    const { context } = settings(
      {
        ...raw,
        "client-secret": secret,
        branch: `${secret} ${jwt}`,
        "build-name": "x".repeat(1000),
        "api-base-url":
          "https://username:password@example.invalid/private?token=private",
      },
      false,
    );
    expect(context.inputsValidated).toBe(false);
    expect(context.inputsTruncated).toBe(true);
    expect(context.inputs["build-name"]!.length).toBeLessThanOrEqual(256);
    const serialized = JSON.stringify(context);
    for (const marker of [secret, jwt, "username", "password", "token=private"])
      expect(serialized).not.toContain(marker);
  });
  it.each([
    ["SUCCESS", "success", "✅"],
    ["FAIL", "failure", "❌"],
    ["DELETED", "cancelled", "⏹️"],
    ["FUTURE", "internal-error", "❌"],
  ])(
    "uses the shared status style and input/result tables for %s",
    async (status, outcome, icon) => {
      const c = fakeCore();
      const result = await run(c.core, harness(replies(status)).rt, workflow);
      const event = parse(c.outputs["notification-event"]!);
      expect(result.outcome).toBe(outcome);
      expect(event.status).toBe(outcome);
      expect(event.data.inputs).toEqual(result.inputs);
      const html = rendered(c);
      for (const name of reporting.inputDefinitions.map((item) => item.name))
        expect(html).toContain(name);
      for (const expected of [
        icon,
        "CCv2 Build",
        "Result",
        "Inputs",
        "Poll count",
        "Duration \\(ms\\)",
        "View workflow",
        "| Input | Value |",
      ])
        expect(html).toContain(expected);
      for (const secret of [
        ...authentication.map((name) => raw[name]!),
        token.access_token,
      ])
        expect(html).not.toContain(secret);
      if (result.buildStatus) expect(html).toContain("Build status");
      expect(c.core.summary.write).toHaveBeenCalledOnce();
      if (result.error)
        expect(html).toContain(result.error.code.replaceAll("_", "\\_"));
    },
  );
  it("captures authentication before any public input, reads once, and reports invalid input without API calls", async () => {
    const c = fakeCore({ branch: "" });
    const order: string[] = [];
    vi.mocked(c.core.getInput).mockImplementation((name) => {
      order.push(`read:${name}`);
      return name === "branch" ? "" : (raw[name] ?? "");
    });
    vi.mocked(c.core.setSecret).mockImplementation((value) => {
      order.push(`mask:${value}`);
    });
    const h = harness([]);
    const result = await run(c.core, h.rt);
    expect(result.inputsValidated).toBe(false);
    expect(parse(c.outputs["notification-event"]!).data.inputs).toEqual(
      result.inputs,
    );
    expect(rendered(c)).toContain("INVALID\\_INPUT");
    expect(h.fetcher).not.toHaveBeenCalled();
    for (const name of authentication)
      expect(order.indexOf(`mask:${raw[name]}`)).toBeLessThan(
        order.indexOf("read:subscription-code"),
      );
    expect(
      vi.mocked(c.core.getInput).mock.calls.map(([name]) => name),
    ).toHaveLength(11);
  });
  it("escapes malicious text and preserves secret masking in every output and summary", async () => {
    const c = fakeCore({
      "build-name": `<script>alert(1)</script> & ${raw["client-secret"]}`,
    });
    await run(c.core, harness(replies()).rt);
    const html = rendered(c);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain(raw["client-secret"]);
    expect(html).toContain("&amp;");
    expect(JSON.stringify(c.outputs)).not.toContain(raw["client-secret"]);
  });
  it("keeps a successful domain result and summary when notification creation fails", async () => {
    vi.spyOn(notification, "event").mockImplementationOnce(() => {
      throw Error("SYNTHETIC_PRIVATE_REPORT_ERROR");
    });
    const c = fakeCore();
    const result = await run(c.core, harness(replies()).rt);
    expect(result.outcome).toBe("success");
    expect(JSON.parse(c.outputs["result-json"]!).outcome).toBe("success");
    expect(c.outputs["notification-event"]).toBe("");
    expect(c.core.setFailed).not.toHaveBeenCalled();
    expect(rendered(c)).toContain("notification-unavailable");
    expect(rendered(c)).not.toContain("SYNTHETIC_PRIVATE_REPORT_ERROR");
  });
  it("preserves the original operation error when outputs fail, and still writes the summary", async () => {
    const c = fakeCore();
    vi.mocked(c.core.setOutput).mockImplementation(() => {
      throw Error("SYNTHETIC_PRIVATE_OUTPUT_ERROR");
    });
    const result = await run(c.core, harness(replies("FAIL")).rt);
    expect(result.error?.code).toBe("BUILD_FAILED");
    expect(c.core.setFailed).toHaveBeenCalledWith(result.error?.message);
    expect(rendered(c)).toContain("outputs-unavailable");
    expect(c.core.summary.write).toHaveBeenCalledOnce();
  });
  it("preserves result output and outcome when input snapshot or summary rendering fails", async () => {
    vi.spyOn(reporting, "inputContext").mockImplementationOnce(() => {
      throw Error("private");
    });
    vi.spyOn(reporting, "summary").mockImplementationOnce(() => {
      throw Error("private");
    });
    const c = fakeCore();
    const result = await run(c.core, harness(replies()).rt);
    expect(result.outcome).toBe("success");
    expect(c.outputs["result-json"]).toBeTruthy();
    expect(c.core.warning).toHaveBeenCalledTimes(2);
    expect(c.core.setFailed).not.toHaveBeenCalled();
  });
  it("does not read unrelated environment secrets or the full GitHub event payload", () => {
    const env = { ...workflow };
    Object.defineProperty(env, "GITHUB_EVENT_PATH", {
      enumerable: true,
      get() {
        throw Error("Must not read full event");
      },
    });
    Object.defineProperty(env, "UNRELATED_SECRET", {
      enumerable: true,
      get() {
        throw Error("Must not read unrelated secret");
      },
    });
    const safe = new Sanitizer(() => {});
    expect(notification.context(env, safe).runUrl).toContain(
      "synthetic/example",
    );
    expect(reporting.summary(initialResult(), safe, env)).toContain(
      "View workflow",
    );
  });
  it.each(["success", "SUCCESS"])(
    "preserves trusted semantic enums when a credential equals %s",
    async (secret) => {
      const c = fakeCore({
        "client-secret": secret,
        branch: secret,
        "build-name": secret,
      });
      const result = await run(c.core, harness(replies()).rt);
      expect(result.buildStatus).toBe("SUCCESS");
      expect(parse(c.outputs["notification-event"]!).data.buildStatus).toBe(
        "SUCCESS",
      );
      expect(result.inputs?.branch).toBe("[REDACTED]");
      expect(result.inputs?.["build-name"]).toBe("[REDACTED]");
      expect(result.outcome).toBe("success");
      expect(parse(c.outputs["notification-event"]!).status).toBe("success");
      expect(result.inputs?.["client-secret"]).toBe("[REDACTED]");
      expect(c.core.setFailed).not.toHaveBeenCalled();
      expect(rendered(c)).toContain("✅");
    },
  );
  it("keeps all invalid Unicode input settings within the shared 64 KiB event bound", async () => {
    const values = Object.fromEntries(
      reporting.inputDefinitions
        .filter((input) => !input.confidential)
        .map((input) => [input.name, "\ud800".repeat(2000)]),
    );
    const c = fakeCore(values);
    const h = harness([]);
    const result = await run(c.core, h.rt);
    const text = c.outputs["notification-event"]!;
    expect(text).toBeTruthy();
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(65536);
    const value = parse(text);
    expect(Object.keys(value.data.inputs!).sort()).toEqual(
      reporting.inputDefinitions.map((input) => input.name).sort(),
    );
    expect(value.data.inputsValidated).toBe(false);
    expect(value.data.inputsTruncated).toBe(true);
    expect(result.inputsValidated).toBe(false);
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(rendered(c)).toContain("Inputs");
  });
  it("bounds a faulty oversized notification without losing the successful result", async () => {
    const original = notification.event;
    vi.spyOn(notification, "event").mockImplementationOnce(
      (result, env, safe) => ({
        ...original(result, env, safe),
        links: Array.from({ length: 1000 }, () => ({
          label: "Synthetic workflow",
          url: "https://github.com/synthetic/example/actions/runs/123",
        })),
      }),
    );
    const c = fakeCore();
    const result = await run(c.core, harness(replies()).rt);
    expect(result.outcome).toBe("success");
    expect(c.outputs["notification-event"]).toBe("");
    expect(JSON.parse(c.outputs["result-json"]!).outcome).toBe("success");
    expect(rendered(c)).toContain("notification-unavailable");
    expect(c.core.setFailed).not.toHaveBeenCalled();
  });
  it("bounds an oversized result snapshot and still writes other outputs and the summary", async () => {
    vi.spyOn(reporting, "inputContext").mockReturnValueOnce({
      inputs: Object.fromEntries(
        Array.from({ length: 400 }, (_, index) => [
          `synthetic-${index}`,
          "x".repeat(256),
        ]),
      ),
      inputsValidated: true,
      inputsTruncated: false,
    });
    const c = fakeCore();
    const result = await run(c.core, harness(replies()).rt);
    expect(result.outcome).toBe("success");
    expect(c.outputs["result-json"]).toBeUndefined();
    expect(c.outputs["duration-ms"]).toBe("0");
    expect(c.core.setFailed).toHaveBeenCalledWith(
      "Action result outputs could not be written.",
    );
    expect(rendered(c)).toContain("outputs-unavailable");
    expect(Buffer.byteLength(rendered(c))).toBeLessThanOrEqual(65536);
  });
  it("renders legacy results with missing context metadata and copies the known-secret inventory", () => {
    const safe = new Sanitizer(() => {});
    safe.add("synthetic-secret");
    const copy = safe.knownSecrets();
    expect(copy).toEqual(["synthetic-secret"]);
    expect(copy).not.toBe(safe.knownSecrets());
    expect(reporting.summary(initialResult(), safe, {})).toContain("❌");
    expect(
      reporting.summary({ ...initialResult(), inputs: {} }, safe, {}),
    ).toContain("Inputs");
    expect(
      reporting.summary(
        { ...initialResult(), issues: [{ code: "safe", message: "Issue" }] },
        safe,
        {},
      ),
    ).toContain("safe");
  });
});
