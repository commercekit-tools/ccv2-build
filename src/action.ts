import type * as core from "@actions/core";
import {
  captureActionInputs,
  type SafeNotificationError,
} from "@commercekit-tools/notification-contract";
import { readInputs, type Inputs } from "./inputs.js";
import { Sanitizer } from "./security.js";
import { ActionError, waitTimeout } from "./errors.js";
import { runtime, type Runtime } from "./runtime.js";
import { BuildTransport } from "./transport.js";
import { BuildApi, statuses } from "./api.js";
import { initialResult, type Result } from "./result.js";
import { event } from "./notification.js";
import { inputContext, inputDefinitions, summary } from "./reporting.js";
const maxStructuredOutputBytes = 65536;
export type Core = Pick<
  typeof core,
  "getInput" | "setSecret" | "setOutput" | "setFailed" | "info" | "warning"
> & { summary: Pick<typeof core.summary, "addRaw" | "write"> };
export async function run(
  core: Core,
  rt: Runtime = runtime,
  env: NodeJS.ProcessEnv = process.env,
  external?: AbortSignal,
) {
  const started = rt.now();
  const safe = new Sanitizer((v) => core.setSecret(v));
  let result = initialResult();
  let captured: Record<string, string> = {};
  let validated: Inputs | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let transport: BuildTransport | undefined;
  let api: BuildApi | undefined;
  let activeSignal: AbortSignal | undefined;
  try {
    captured = captureActionInputs(
      inputDefinitions,
      (name) => core.getInput(name, { trimWhitespace: false }),
      (value) => safe.add(value),
    );
    const input = readInputs((name) => captured[name] ?? "", safe);
    validated = input;
    Object.assign(result, {
      subscriptionCode: input.subscriptionCode,
      buildName: input.buildName,
      branch: input.branch,
      ...(input.applicationCode
        ? { applicationCode: input.applicationCode }
        : {}),
    });
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(waitTimeout()), input.timeoutMs);
    const signal = external
      ? AbortSignal.any([external, controller.signal])
      : controller.signal;
    activeSignal = signal;
    const deadline = started + input.timeoutMs;
    const check = () => {
      signal.throwIfAborted();
      if (rt.now() >= deadline) throw waitTimeout();
    };
    transport = new BuildTransport(input, rt, signal, safe);
    api = new BuildApi(input, transport, safe);
    core.info("Authenticating with the CCv2 technical user.");
    await transport.authenticate();
    check();
    core.info("Creating CCv2 build.");
    const build = await api.create();
    result.buildCode = build.code;
    core.info(`Build created: ${safe.text(build.code)}.`);
    let previous = "";
    for (;;) {
      check();
      const progress = await api.progress(build.code);
      const { errorMessage, ...state } = progress;
      Object.assign(result, state);
      check();
      const label = `${progress.buildStatus}${progress.percentage === undefined ? "" : ` (${progress.percentage}%)`}`;
      if (label !== previous) {
        core.info(`Build status: ${label}.`);
        previous = label;
      }
      if (progress.buildStatus === "SUCCESS") {
        result.outcome = "success";
        break;
      }
      if (!["SCHEDULED", "BUILDING"].includes(progress.buildStatus)) {
        const status = progress.buildStatus;
        result.outcome =
          status === "FAIL"
            ? "failure"
            : status === "DELETED"
              ? "cancelled"
              : "internal-error";
        throw new ActionError(
          status === "FAIL"
            ? "BUILD_FAILED"
            : status === "DELETED"
              ? "BUILD_DELETED"
              : "BUILD_UNKNOWN_STATUS",
          errorMessage || `CCv2 build finished with status ${status}.`,
        );
      }
      await rt.sleep(
        Math.min(input.pollIntervalMs, Math.max(0, deadline - rt.now())),
        signal,
      );
    }
  } catch (error) {
    const failure = activeSignal?.aborted ? activeSignal.reason : error;
    const known =
      failure instanceof ActionError
        ? failure
        : external?.aborted
          ? new ActionError(
              "ACTION_CANCELLED",
              "The Action was interrupted. The remote build may still continue.",
            )
          : new ActionError(
              "INTERNAL_ERROR",
              "The Action encountered an internal error.",
            );
    result.error = {
      code: known.code,
      message: safe.text(known.message) || "The Action encountered an error.",
      ...(known.httpStatus ? { httpStatus: known.httpStatus } : {}),
    };
    result.timedOut = known.code === "BUILD_WAIT_TIMEOUT";
  } finally {
    if (timer) clearTimeout(timer);
  }
  result.pollCount = api?.pollCount ?? 0;
  result.retryCount = transport?.retryCount ?? 0;
  result.durationMs = Math.max(0, Math.floor(rt.now() - started));
  // Sanitize untrusted data without changing locally selected semantic enums.
  const outcome = result.outcome;
  const buildStatus =
    result.buildStatus && statuses.includes(result.buildStatus)
      ? result.buildStatus
      : undefined;
  result = JSON.parse(
    JSON.stringify(result, (_key, value: unknown) =>
      typeof value === "string" ? safe.text(value) : value,
    ),
  ) as Result;
  result.outcome = outcome;
  if (buildStatus) result.buildStatus = buildStatus;
  try {
    Object.assign(result, inputContext(captured, validated, safe));
  } catch {
    core.warning(
      "The input summary could not be prepared; the Action result is preserved.",
    );
  }
  const outputFailure = await emit(core, result, safe, env);
  if (result.outcome !== "success")
    core.setFailed(result.error?.message ?? "CCv2 build did not succeed.");
  else if (outputFailure)
    core.setFailed("Action result outputs could not be written.");
  else core.info("Build completed successfully.");
  return result;
}
async function emit(
  core: Core,
  result: Result,
  safe: Sanitizer,
  env: NodeJS.ProcessEnv,
) {
  const reportingIssues: SafeNotificationError[] = [];
  let eventJson: string;
  try {
    eventJson = JSON.stringify(event(result, env, safe));
    if (Buffer.byteLength(eventJson) > maxStructuredOutputBytes)
      throw Error("Output exceeds limit.");
  } catch {
    eventJson = "";
    reportingIssues.push({
      code: "notification-unavailable",
      message:
        "The notification event could not be prepared; the Action result is preserved.",
    });
    core.warning(
      "The notification event could not be prepared; the Action result is preserved.",
    );
  }
  const json = JSON.stringify(result);
  let outputFailure = false;
  for (const [name, value] of Object.entries({
    "build-code": result.buildCode ?? "",
    "build-status": result.buildStatus ?? "",
    "build-percentage":
      result.percentage === undefined ? "" : String(result.percentage),
    "poll-count": String(result.pollCount),
    "duration-ms": String(result.durationMs),
    "result-json": json,
    "notification-event": eventJson,
  })) {
    try {
      const limit =
        name === "result-json" || name === "notification-event"
          ? maxStructuredOutputBytes
          : 16384;
      if (Buffer.byteLength(value) > limit)
        throw Error("Output exceeds limit.");
      core.setOutput(name, value);
    } catch {
      outputFailure = true;
    }
  }
  if (outputFailure) {
    core.warning(
      "Action result outputs could not be written; the original result is preserved.",
    );
    reportingIssues.push({
      code: "outputs-unavailable",
      message:
        "Some Action outputs could not be written. Review the available result and run summary.",
    });
  }
  try {
    core.summary.addRaw(summary(result, safe, env, reportingIssues));
    await core.summary.write();
  } catch {
    core.warning("The step summary could not be written.");
  }
  return outputFailure;
}
