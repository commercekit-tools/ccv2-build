import * as core from "@actions/core";
import { base, scenarios, request } from "./common.mjs";
try {
  const scenario = process.env.SCENARIO;
  if (
    process.env.CONFIRMATION !== "RUN-COMMERCEKIT-SANDBOX-BUILD" ||
    !scenarios.includes(scenario)
  )
    throw Error("Sandbox confirmation or scenario is invalid.");
  const run = await request("/sandbox/v1/runs", "POST");
  const c = run.credentials;
  for (const value of [
    run.controlToken,
    c.clientId,
    c.clientSecret,
    c.resource,
    c.tokenUrl,
  ])
    core.setSecret(value);
  // Publish cleanup credentials before scenario configuration can fail.
  core.setOutput("run-id", run.runId);
  core.setOutput("control-token", run.controlToken);
  if (
    !/^run_[0-9a-f]{32}$/.test(run.runId) ||
    c.tokenUrl !== base + "/oauth2/token"
  )
    throw Error("Unexpected Sandbox credential response.");
  for (const [name, value] of Object.entries({
    "token-endpoint": c.tokenUrl,
    "client-id": c.clientId,
    "client-secret": c.clientSecret,
    resource: c.resource,
    "subscription-code": "131762872233634f29fdeb7d50983aa4",
  }))
    core.setOutput(name, value);
  const faults =
    scenario === "rate-limit"
      ? [
          {
            operationId: "getBuildProgress",
            status: 429,
            onCalls: [1],
            retryAfterSeconds: 1,
          },
        ]
      : scenario === "create-error"
        ? [{ operationId: "createBuild", status: 500, onCalls: [1] }]
        : [];
  await request(
    `/sandbox/v1/runs/${run.runId}/scenario`,
    "PUT",
    run.controlToken,
    {
      build: {
        outcome:
          scenario === "failure"
            ? "FAIL"
            : scenario === "nonterminating"
              ? "NEVER"
              : "SUCCESS",
        pollsBeforeTerminal: 1,
        logsAvailable: true,
        ...(scenario === "failure"
          ? { failureMessage: "Synthetic Sandbox build failure." }
          : {}),
      },
      deployment: {
        outcome: "DEPLOYED",
        pollsBeforeTerminal: 1,
        cancellationAllowed: true,
        requireGreenDecision: false,
      },
      faults,
    },
  );
} catch {
  core.setFailed(
    "Sandbox preparation failed. Inspect confirmation and Sandbox availability.",
  );
}
