import type * as core from "@actions/core";
import { readInputs } from "./inputs.js";
import { Sanitizer, escapeHtml } from "./security.js";
import { ActionError, waitTimeout } from "./errors.js";
import { runtime, type Runtime } from "./runtime.js";
import { BuildTransport } from "./transport.js";
import { BuildApi } from "./api.js";
import { initialResult, type Result } from "./result.js";
import { event } from "./notification.js";
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  let transport: BuildTransport | undefined;
  let api: BuildApi | undefined;
  let activeSignal: AbortSignal | undefined;
  try {
    const input = readInputs(
      (n) => core.getInput(n, { trimWhitespace: false }),
      safe,
    );
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
  // Explicit allowlisted model; sanitize every string before any output or summary.
  result = JSON.parse(
    JSON.stringify(result, (_key, value: unknown) =>
      typeof value === "string" ? safe.text(value) : value,
    ),
  ) as Result;
  try {
    await emit(core, result, safe, env);
  } catch {
    result = {
      ...initialResult(),
      durationMs: result.durationMs,
      error: {
        code: "INTERNAL_ERROR",
        message: "The Action could not publish its result.",
      },
    };
    try {
      await emit(core, result, safe, {});
    } catch {
      core.setFailed("The Action could not publish its result.");
    }
  }
  return result;
}
async function emit(
  core: Core,
  result: Result,
  safe: Sanitizer,
  env: NodeJS.ProcessEnv,
) {
  const notification = event(result, env, safe);
  const json = JSON.stringify(result);
  const eventJson = JSON.stringify(notification);
  if (Buffer.byteLength(json) > 16384 || Buffer.byteLength(eventJson) > 16384)
    throw Error("Output exceeds limit.");
  for (const [name, value] of Object.entries({
    "build-code": result.buildCode ?? "",
    "build-status": result.buildStatus ?? "",
    "build-percentage":
      result.percentage === undefined ? "" : String(result.percentage),
    "poll-count": String(result.pollCount),
    "duration-ms": String(result.durationMs),
    "result-json": json,
    "notification-event": eventJson,
  }))
    core.setOutput(name, value);
  const rows = [
    ["Status", result.buildStatus ?? result.outcome],
    ["Build code", result.buildCode],
    ["Build name", result.buildName],
    ["Branch", result.branch],
    ["Application", result.applicationCode],
    ["Percentage", result.percentage],
    ["Poll count", result.pollCount],
    ["Duration (ms)", result.durationMs],
    ["Error", result.error?.message],
  ].filter(([, v]) => v !== undefined);
  try {
    core.summary.addRaw(
      "<h2>CCv2 Build</h2><table>" +
        rows
          .map(
            ([k, v]) =>
              `<tr><td>${k}</td><td>${escapeHtml(String(v))}</td></tr>`,
          )
          .join("") +
        "</table>",
    );
    await core.summary.write();
  } catch {
    core.warning("The step summary could not be written.");
  }
  if (result.outcome !== "success")
    core.setFailed(result.error?.message ?? "CCv2 build did not succeed.");
  else core.info("Build completed successfully.");
}
