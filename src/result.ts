import type {
  CompletedStatus,
  SafeNotificationError,
} from "@commercekit-tools/notification-contract";
import type { BuildStatus } from "./api.js";
export interface Result {
  schemaVersion: 1;
  outcome: CompletedStatus;
  subscriptionCode?: string;
  applicationCode?: string;
  buildCode?: string;
  buildName?: string;
  branch?: string;
  buildStatus?: BuildStatus;
  percentage?: number;
  numberOfTasks?: number;
  startedTaskCount?: number;
  pollCount: number;
  durationMs: number;
  timedOut: boolean;
  retryCount: number;
  error?: Required<SafeNotificationError> & { httpStatus?: number };
}
export const initialResult = (): Result => ({
  schemaVersion: 1,
  outcome: "internal-error",
  pollCount: 0,
  durationMs: 0,
  timedOut: false,
  retryCount: 0,
});
