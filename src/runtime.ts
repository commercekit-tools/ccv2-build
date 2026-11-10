import { defaultRuntime } from "@commercekit-tools/ccv2-client";
export interface Runtime {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  random: () => number;
}
export const runtime: Runtime = {
  ...defaultRuntime,
  now: () => performance.now(),
};
