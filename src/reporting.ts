import {
  createActionInputContext,
  renderActionSummary,
  type ActionInputDefinition,
  type NotificationInputContext,
  type SafeNotificationError,
} from "@commercekit-tools/notification-contract";
import type { Inputs } from "./inputs.js";
import type { Result } from "./result.js";
import type { Sanitizer } from "./security.js";
import { context } from "./notification.js";

export const inputDefinitions: readonly ActionInputDefinition[] = [
  { name: "token-endpoint", confidential: true },
  { name: "client-id", confidential: true },
  { name: "client-secret", confidential: true },
  { name: "resource", confidential: true },
  { name: "subscription-code" },
  { name: "branch" },
  { name: "build-name" },
  { name: "application-code" },
  { name: "api-base-url", display: "url-origin" },
  { name: "poll-interval-seconds" },
  { name: "timeout-minutes" },
];

export function inputContext(
  raw: Readonly<Record<string, string>>,
  input: Inputs | undefined,
  safe: Sanitizer,
): NotificationInputContext {
  return createActionInputContext(inputDefinitions, raw, {
    validated: input !== undefined,
    secrets: safe.knownSecrets(),
    ...(input
      ? {
          effective: {
            "subscription-code": input.subscriptionCode,
            branch: input.branch,
            "build-name": input.buildName,
            "application-code": input.applicationCode ?? "",
            "api-base-url": input.apiBaseUrl,
            "poll-interval-seconds": String(input.pollIntervalMs / 1000),
            "timeout-minutes": String(input.timeoutMs / 60000),
          },
        }
      : {}),
  });
}

export function summary(
  result: Result,
  safe: Sanitizer,
  env: NodeJS.ProcessEnv,
  reportingIssues: readonly SafeNotificationError[] = [],
): string {
  const ctx = context(env, safe);
  const facts = [
    ["Build status", result.buildStatus],
    ["Subscription", result.subscriptionCode],
    ["Application", result.applicationCode],
    ["Build code", result.buildCode],
    ["Build name", result.buildName],
    ["Branch", result.branch],
    ["Progress (%)", result.percentage],
    ["Poll count", result.pollCount],
    ["Retry count", result.retryCount],
    ["Duration (ms)", result.durationMs],
    ["Timed out", result.timedOut],
  ] as const;
  return renderActionSummary({
    title: "CCv2 Build",
    status: result.outcome,
    facts: facts.flatMap(([label, value]) =>
      value === undefined ? [] : [{ label, value }],
    ),
    ...(result.inputs
      ? {
          inputContext: {
            inputs: result.inputs,
            inputsValidated: result.inputsValidated ?? false,
            inputsTruncated: result.inputsTruncated ?? false,
          },
        }
      : {}),
    ...(result.error ? { error: result.error } : {}),
    issues: [...(result.issues ?? []), ...reportingIssues].slice(0, 3),
    ...(ctx.runUrl
      ? { links: [{ label: "View workflow", url: ctx.runUrl }] }
      : {}),
    secrets: safe.knownSecrets(),
  });
}
