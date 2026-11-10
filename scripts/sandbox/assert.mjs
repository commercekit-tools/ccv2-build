import assert from "node:assert/strict";
import { parseNotificationEventJson } from "@commercekit-tools/notification-contract";
import * as core from "@actions/core";
import { credentials, request, scenarios } from "./common.mjs";
try {
  const run = credentials();
  const scenario = process.env.SCENARIO;
  assert(scenarios.includes(scenario));
  const raw = process.env.RESULT_JSON;
  const rawEvent = process.env.NOTIFICATION_EVENT;
  for (const key of [
    "CONTROL_TOKEN",
    "CLIENT_ID",
    "CLIENT_SECRET",
    "RESOURCE",
    "TOKEN_ENDPOINT",
  ]) {
    const value = process.env[key];
    assert(value);
    assert(!raw.includes(value) && !rawEvent.includes(value));
  }
  const result = JSON.parse(raw);
  const event = parseNotificationEventJson(rawEvent, { maxBytes: 16384 });
  assert.equal(result.schemaVersion, 1);
  assert.equal(event.eventType, "ccv2.build.completed");
  assert(Number.isSafeInteger(result.durationMs) && result.durationMs >= 0);
  assert(Number.isSafeInteger(result.pollCount) && result.pollCount >= 0);
  assert.equal(process.env.DURATION_MS, String(result.durationMs));
  assert.equal(process.env.POLL_COUNT, String(result.pollCount));
  const success = ["success", "rate-limit"].includes(scenario);
  const expected = success
    ? "success"
    : scenario === "failure"
      ? "failure"
      : "internal-error";
  assert.equal(result.outcome, expected);
  assert.equal(event.status, expected);
  assert.equal(process.env.ACTION_OUTCOME, success ? "success" : "failure");
  assert.equal(process.env.BUILD_STATUS, result.buildStatus ?? "");
  assert.equal(process.env.BUILD_CODE, result.buildCode ?? "");
  const state = await request(
    `/sandbox/v1/runs/${run}/state`,
    "GET",
    process.env.CONTROL_TOKEN,
  );
  if (scenario === "create-error") {
    assert.equal(result.error.code, "CREATE_BUILD_AMBIGUOUS");
    assert.equal(result.pollCount, 0);
    assert.equal(state.counts.builds, 0);
    assert.equal(state.faultCounters["createBuild:"], 1);
  } else {
    assert.match(result.buildCode, /^\d{8}\.\d+$/);
    assert(result.pollCount >= 2);
    assert.equal(state.counts.builds, 1);
    assert.equal(
      result.buildStatus,
      success ? "SUCCESS" : scenario === "failure" ? "FAIL" : "BUILDING",
    );
  }
  if (scenario === "nonterminating") {
    assert.equal(result.error.code, "BUILD_WAIT_TIMEOUT");
    assert.equal(result.timedOut, true);
  }
  if (scenario === "rate-limit") assert(result.retryCount >= 1);
  core.info("Sandbox output and state assertions passed.");
} catch {
  core.setFailed("Sandbox output or state assertions failed.");
}
