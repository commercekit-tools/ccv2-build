import { it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
it.each(["success", "failure", "nonterminating", "rate-limit", "create-error"])(
  "prepares %s using only mocked Sandbox and always publishes cleanup details",
  (scenario) => {
    const dir = mkdtempSync(join(tmpdir(), "sandbox-mock-"));
    try {
      const out = join(dir, "out"),
        log = join(dir, "requests"),
        preload = join(dir, "mock.cjs");
      writeFileSync(out, "");
      writeFileSync(
        preload,
        `const fs=require('fs');global.fetch=async(url,init)=>{if(new URL(url).origin!=='https://ccv2.sandbox.commercekit.tools'||init.redirect!=='error')throw Error();fs.appendFileSync(process.env.TEST_LOG,JSON.stringify({url:String(url),method:init.method,body:init.body})+'\\n');return Response.json(init.method==='POST'?{runId:'run_'+'a'.repeat(32),controlToken:'FAKE_CONTROL',credentials:{clientId:'FAKE_CLIENT',clientSecret:'FAKE_SECRET',resource:'FAKE_RESOURCE',tokenUrl:'https://ccv2.sandbox.commercekit.tools/oauth2/token'}}:{});};`,
      );
      const r = spawnSync(
        process.execPath,
        ["--require", preload, "scripts/sandbox/prepare.mjs"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            SCENARIO: scenario,
            CONFIRMATION: "RUN-COMMERCEKIT-SANDBOX-BUILD",
            GITHUB_OUTPUT: out,
            TEST_LOG: log,
          },
        },
      );
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(out, "utf8")).toContain("control-token");
      const calls = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s));
      expect(calls).toHaveLength(2);
      const config = JSON.parse(calls[1].body);
      expect(config.build.outcome).toBe(
        scenario === "failure"
          ? "FAIL"
          : scenario === "nonterminating"
            ? "NEVER"
            : "SUCCESS",
      );
      if (scenario === "create-error")
        expect(config.faults[0]).toMatchObject({
          operationId: "createBuild",
          status: 500,
          onCalls: [1],
        });
      expect(r.stdout).toContain("::add-mask::FAKE_SECRET");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
it("rejects invalid confirmation without network", () => {
  const r = spawnSync(process.execPath, ["scripts/sandbox/prepare.mjs"], {
    encoding: "utf8",
    env: { ...process.env, SCENARIO: "success", CONFIRMATION: "NO" },
  });
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("Sandbox preparation failed");
});
it("cleanup is a no-op when no disposable run was created", () => {
  const r = spawnSync(process.execPath, ["scripts/sandbox/cleanup.mjs"], {
    encoding: "utf8",
    env: { ...process.env, RUN_ID: "" },
  });
  expect(r.status).toBe(0);
});
it.each(["success", "failure", "nonterminating", "rate-limit", "create-error"])(
  "validates %s outputs against mocked isolated state",
  (scenario) => {
    const dir = mkdtempSync(join(tmpdir(), "sandbox-assert-"));
    try {
      const preload = join(dir, "mock.cjs");
      writeFileSync(
        preload,
        `global.fetch=async()=>Response.json({counts:{builds:${scenario === "create-error" ? 0 : 1}},faultCounters:{'createBuild:':1}});`,
      );
      const success = ["success", "rate-limit"].includes(scenario),
        createError = scenario === "create-error";
      const outcome = success
        ? "success"
        : scenario === "failure"
          ? "failure"
          : "internal-error";
      const status = success
        ? "SUCCESS"
        : scenario === "failure"
          ? "FAIL"
          : "BUILDING";
      const result = {
        schemaVersion: 1,
        outcome,
        durationMs: 1000,
        pollCount: createError ? 0 : 2,
        retryCount: scenario === "rate-limit" ? 1 : 0,
        timedOut: scenario === "nonterminating",
        ...(!createError
          ? { buildCode: "20260101.1", buildStatus: status }
          : {}),
        ...(!success
          ? {
              error: {
                code: createError
                  ? "CREATE_BUILD_AMBIGUOUS"
                  : scenario === "nonterminating"
                    ? "BUILD_WAIT_TIMEOUT"
                    : "BUILD_FAILED",
                message: "Synthetic failure",
              },
            }
          : {}),
      };
      const event = {
        schemaVersion: 1,
        eventId: "ckevt_synthetic",
        eventType: "ccv2.build.completed",
        status: outcome,
        occurredAt: "2026-01-01T00:00:00Z",
        source: { product: "commercekit", component: "ccv2-build" },
        data: {},
      };
      const r = spawnSync(
        process.execPath,
        ["--require", preload, "scripts/sandbox/assert.mjs"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            SCENARIO: scenario,
            RUN_ID: "run_" + "a".repeat(32),
            CONTROL_TOKEN: "FAKE_CONTROL",
            CLIENT_ID: "FAKE_CLIENT",
            CLIENT_SECRET: "FAKE_SECRET",
            RESOURCE: "FAKE_RESOURCE",
            TOKEN_ENDPOINT: "https://auth.example.invalid/token",
            RESULT_JSON: JSON.stringify(result),
            NOTIFICATION_EVENT: JSON.stringify(event),
            DURATION_MS: "1000",
            POLL_COUNT: String(result.pollCount),
            BUILD_CODE: createError ? "" : "20260101.1",
            BUILD_STATUS: createError ? "" : status,
            ACTION_OUTCOME: success ? "success" : "failure",
          },
        },
      );
      expect(r.status, r.stdout + r.stderr).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
