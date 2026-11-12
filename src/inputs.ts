import {
  validateTechnicalUserTokenEndpoint,
  validateManagementApiBaseUrl,
  type TechnicalUserCredentials,
} from "@commercekit-tools/ccv2-client";
import { ActionError } from "./errors.js";
import type { Sanitizer } from "./security.js";
export const controls = /[\u0000-\u001f\u007f-\u009f]/;
export function textInput(
  value: string,
  name: string,
  max: number,
  optional = false,
) {
  if (
    (!optional && !value.trim()) ||
    value.length > max ||
    controls.test(value)
  )
    throw new ActionError("INVALID_INPUT", `Invalid ${name} input.`);
  return value;
}
export function httpsUrl(value: string, management = false): URL {
  try {
    return (
      management
        ? validateManagementApiBaseUrl
        : validateTechnicalUserTokenEndpoint
    )(value);
  } catch {
    throw new ActionError(
      "INVALID_INPUT",
      "A configured URL must be HTTPS without credentials, query, or fragment.",
    );
  }
}
export function segment(value: string): string {
  textInput(value, "path identifier", 128);
  if (/[/?#\\]/.test(value) || value === "." || value === "..")
    throw new ActionError("INVALID_INPUT", "Invalid path identifier.");
  return encodeURIComponent(value);
}
export interface Inputs extends TechnicalUserCredentials {
  subscriptionCode: string;
  branch: string;
  buildName: string;
  applicationCode?: string;
  apiBaseUrl: string;
  pollIntervalMs: number;
  timeoutMs: number;
}
export function readInputs(
  get: (name: string) => string,
  safe: Sanitizer,
): Inputs {
  const secretNames = [
    "token-endpoint",
    "client-id",
    "client-secret",
    "resource",
  ];
  const secrets: Record<string, string> = {};
  for (const name of secretNames) {
    const value = get(name);
    safe.add(value);
    secrets[name] = value;
  }
  for (const n of secretNames)
    textInput(secrets[n]!, n, n === "client-secret" ? 8192 : 2048);
  const tokenEndpoint = httpsUrl(secrets["token-endpoint"]!).href;
  const apiBaseUrl = httpsUrl(
    get("api-base-url") || "https://portalapi.commerce.ondemand.com",
    true,
  ).href;
  const subscriptionCode = textInput(
    get("subscription-code"),
    "subscription-code",
    128,
  );
  segment(subscriptionCode);
  const branch = textInput(get("branch"), "branch", 300);
  const buildName = textInput(get("build-name"), "build-name", 200);
  const applicationCode = textInput(
    get("application-code"),
    "application-code",
    128,
    true,
  );
  function integer(name: string, fallback: string, min: number, max: number) {
    const s = get(name) || fallback;
    const n = Number(s);
    if (!/^\d+$/.test(s) || !Number.isSafeInteger(n) || n < min || n > max)
      throw new ActionError("INVALID_INPUT", `Invalid ${name} input.`);
    return n;
  }
  return {
    tokenEndpoint,
    clientId: secrets["client-id"]!,
    clientSecret: secrets["client-secret"]!,
    resource: secrets.resource!,
    subscriptionCode,
    branch,
    buildName,
    ...(applicationCode.trim() ? { applicationCode } : {}),
    apiBaseUrl,
    pollIntervalMs: integer("poll-interval-seconds", "60", 10, 600) * 1000,
    timeoutMs: integer("timeout-minutes", "120", 1, 1440) * 60000,
  };
}
