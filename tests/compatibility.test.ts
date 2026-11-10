import { readFileSync } from "node:fs";
import { it, expect, vi } from "vitest";
import { run, type Core } from "../src/action.js";
import { harness, token } from "./harness.js";
import { raw } from "./fixtures.js";
import { validateNotificationEvent } from "@commercekit-tools/notification-contract";

// Captured on the pre-migration implementation at ebdc830. Only generated identity/time is normalized.
it("preserves complete public outputs and validates every completion path", async () => {
  const create = { code: "synthetic.1" };
  const cases: [string, object[], Record<string, string>?][] = [
    ...["SUCCESS", "FAIL", "DELETED", "UNKNOWN"].map(
      (buildStatus): [string, object[]] => [
        buildStatus,
        [
          token,
          create,
          {
            buildStatus,
            percentage: 95,
            numberOfTasks: 2,
            startedTasks: [{}, {}],
          },
        ],
      ],
    ),
    ["auth", [Response.json({}, { status: 401 })]],
    ["invalid-token", [{}]],
    ["create", [token, Response.json({}, { status: 400 })]],
    ["ambiguous", [token, new Error("FAKE_TRANSPORT_ERROR")]],
    ["progress", [token, create, Response.json({}, { status: 403 })]],
    [
      "timeout",
      [token, create, { buildStatus: "BUILDING", percentage: 35 }],
      { "timeout-minutes": "1" },
    ],
    ["input", [], { branch: "" }],
    [
      "retry",
      [
        token,
        create,
        Response.json({}, { status: 429, headers: { "retry-after": "2" } }),
        { buildStatus: "SUCCESS" },
      ],
    ],
    [
      "refresh",
      [
        token,
        create,
        Response.json({}, { status: 401 }),
        token,
        { buildStatus: "SUCCESS" },
      ],
    ],
    [
      "problem",
      [
        token,
        Response.json(
          { title: "Synthetic problem", detail: "Safe detail" },
          {
            status: 409,
            headers: { "content-type": "application/problem+json" },
          },
        ),
      ],
    ],
    ["unexpected", []],
    ["cancelled", []],
  ];
  const fixtures = [];
  for (const [name, replies, overrides = {}] of cases) {
    const outputs: Record<string, string> = {};
    const calls: string[] = [];
    const summaries: string[] = [];
    const core: Core = {
      getInput: (key) => {
        if (name === "unexpected") throw Error("FAKE_INTERNAL_ERROR");
        return overrides[key] ?? raw[key] ?? "";
      },
      setSecret: vi.fn(),
      setOutput: (key, value) => {
        calls.push(key);
        outputs[key] = value;
      },
      setFailed: () => {
        calls.push("failed");
      },
      info: vi.fn(),
      warning: vi.fn(),
      summary: {
        addRaw: ((value: string) => {
          summaries.push(value);
        }) as Core["summary"]["addRaw"],
        write: vi.fn(),
      },
    };
    const rt = harness(replies).rt;
    await run(
      core,
      rt,
      {
        GITHUB_REPOSITORY: "synthetic/example",
        GITHUB_RUN_ID: "123",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_REF: "refs/heads/main",
        GITHUB_SHA: "a".repeat(40),
        GITHUB_ACTOR: "synthetic",
        GITHUB_WORKFLOW: "Build",
        GITHUB_JOB: "build",
      },
      name === "cancelled" ? AbortSignal.abort() : undefined,
    );
    const event = validateNotificationEvent(
      JSON.parse(outputs["notification-event"]!),
    );
    event.eventId = "ckevt_synthetic";
    event.occurredAt = "2026-01-01T00:00:00.000Z";
    fixtures.push({
      name,
      outputs: {
        ...outputs,
        "result-json": JSON.parse(outputs["result-json"]!),
        "notification-event": event,
      },
      calls,
      summaries,
    });
  }
  expect(JSON.parse(JSON.stringify(fixtures))).toEqual(
    JSON.parse(readFileSync("tests/fixtures/build-compatibility.json", "utf8")),
  );
});
