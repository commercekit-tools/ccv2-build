import {
  createBuildEvent,
  extractSafeGitHubContext,
  type BuildEventData,
} from "@commercekit-tools/notification-contract";
import type { Result } from "./result.js";
import { controls } from "./inputs.js";
import type { Sanitizer } from "./security.js";

export function context(env: NodeJS.ProcessEnv, safe: Sanitizer) {
  // Keep Build's exact-secret/control-character exclusion before shared allowlisted extraction.
  const filtered = Object.fromEntries(
    Object.entries(env).filter(
      ([, value]) =>
        value !== undefined && !controls.test(value) && !safe.contains(value),
    ),
  );
  const ctx = extractSafeGitHubContext(filtered);
  if (ctx.runUrl && safe.contains(ctx.runUrl)) delete ctx.runUrl;
  return ctx;
}
export function event(result: Result, env: NodeJS.ProcessEnv, safe: Sanitizer) {
  const data: BuildEventData = {
    durationMs: result.durationMs,
    retryCount: result.retryCount,
    ...(result.error
      ? { error: { code: result.error.code, message: result.error.message } }
      : {}),
  };
  for (const key of [
    "subscriptionCode",
    "applicationCode",
    "buildCode",
    "buildName",
    "branch",
    "buildStatus",
  ] as const)
    if (result[key] !== undefined) data[key] = result[key];
  const ctx = context(env, safe);
  return createBuildEvent({
    status: result.outcome,
    source: { product: "commercekit", component: "ccv2-build" },
    data,
    context: ctx,
    ...(ctx.runUrl
      ? { links: [{ label: "View workflow", url: ctx.runUrl }] }
      : {}),
  });
}
