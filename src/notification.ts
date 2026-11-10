import {
  createBuildEvent,
  extractSafeGitHubContext,
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
  const ctx = context(env, safe);
  return createBuildEvent({
    status: result.outcome,
    // The shared factory selects only schema-approved build/error fields and sets the Build source.
    data: result,
    context: ctx,
    ...(ctx.runUrl
      ? { links: [{ label: "View workflow", url: ctx.runUrl }] }
      : {}),
  });
}
