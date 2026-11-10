import {
  defaultRuntime,
  type RuntimeDependencies,
} from "@commercekit-tools/ccv2-client";
export type Runtime = Pick<
  RuntimeDependencies,
  "fetch" | "now" | "sleep" | "random"
>;
export const runtime: Runtime = {
  ...defaultRuntime,
  now: () => performance.now(),
};
