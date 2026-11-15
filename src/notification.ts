import {
  createBuildEvent,
  extractSafeGitHubContext,
} from "@commercekit-tools/notification-contract";
import type { Result } from "./result.js";
import { controls } from "./inputs.js";
import type { Sanitizer } from "./security.js";

export function context(env: NodeJS.ProcessEnv, safe: Sanitizer) {
  // Read only the package's allowlisted environment values, with Build's stricter policy.
  const ctx = extractSafeGitHubContext(
    new Proxy(env, {
      get(target, key: string) {
        const value = target[key];
        return value !== undefined &&
          !controls.test(value) &&
          !safe.contains(value)
          ? value
          : undefined;
      },
    }),
  );
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
