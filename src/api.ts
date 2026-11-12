import { ActionError, invalidResponse } from "./errors.js";
import { segment, type Inputs } from "./inputs.js";
import type { Ccv2Response } from "@commercekit-tools/ccv2-client";
import type { BuildTransport } from "./transport.js";
import type { Sanitizer } from "./security.js";
export const statuses = [
  "SCHEDULED",
  "BUILDING",
  "SUCCESS",
  "FAIL",
  "DELETED",
  "UNKNOWN",
] as const;
export type BuildStatus = (typeof statuses)[number];
export interface CreateBuildRequest {
  branch: string;
  name: string;
  applicationCode?: string;
}
export interface CreateBuildResponse {
  code: string;
  subscriptionCode?: string;
}
export interface BuildProgress {
  buildStatus: BuildStatus;
  percentage?: number;
  numberOfTasks?: number;
  startedTaskCount?: number;
  errorMessage?: string;
}
export class BuildApi {
  get pollCount() {
    return this.transport.pollCount;
  }
  constructor(
    private input: Inputs,
    private transport: BuildTransport,
    private safe: Sanitizer,
  ) {}
  private async request(buildCode?: string): Promise<Record<string, unknown>> {
    const create = buildCode === undefined;
    const path = `v2/subscriptions/${segment(this.input.subscriptionCode)}/builds${create ? "" : `/${segment(buildCode)}/progress`}`;
    const reply: Ccv2Response = create
      ? await this.transport.request(
          path,
          {
            policy: "unsafe-mutation",
            refreshOn401: true,
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              branch: this.input.branch,
              name: this.input.buildName,
              ...(this.input.applicationCode
                ? { applicationCode: this.input.applicationCode }
                : {}),
            }),
          },
          "create",
        )
      : await this.transport.request(
          path,
          {
            policy: "safe-read",
            refreshOn401: true,
            method: "GET",
            headers: { Accept: "application/json" },
          },
          "progress",
        );
    if (reply.status !== (create ? 201 : 200)) {
      const code = create
        ? reply.status >= 500
          ? "CREATE_BUILD_AMBIGUOUS"
          : "CREATE_BUILD_FAILED"
        : "BUILD_PROGRESS_FAILED";
      const parts = [reply.problem?.title, reply.problem?.detail]
        .filter((s): s is string => typeof s === "string")
        .map((s) => this.safe.text(s, 400))
        .filter(Boolean);
      throw new ActionError(
        code,
        `CCv2 ${create ? "build creation" : "progress request"} failed (HTTP ${reply.status}).${parts.length ? " " + parts.join(": ") : ""}`,
        reply.status,
      );
    }
    if (
      reply.body.kind !== "json" ||
      !reply.body.value ||
      typeof reply.body.value !== "object" ||
      Array.isArray(reply.body.value)
    )
      throw invalidResponse();
    return reply.body.value as Record<string, unknown>;
  }
  async create(): Promise<CreateBuildResponse> {
    const body = await this.request();
    if (typeof body.code !== "string") throw invalidResponse();
    try {
      segment(body.code);
    } catch {
      throw invalidResponse();
    }
    if (
      body.subscriptionCode !== undefined &&
      body.subscriptionCode !== this.input.subscriptionCode
    )
      throw invalidResponse();
    return { code: body.code };
  }
  async progress(code: string): Promise<BuildProgress> {
    const b = await this.request(code);
    if (
      !statuses.includes(b.buildStatus as BuildStatus) ||
      (b.buildCode !== undefined && b.buildCode !== code) ||
      (b.subscriptionCode !== undefined &&
        b.subscriptionCode !== this.input.subscriptionCode)
    )
      throw invalidResponse();
    const p: BuildProgress = { buildStatus: b.buildStatus as BuildStatus };
    if (
      typeof b.percentage === "number" &&
      Number.isFinite(b.percentage) &&
      b.percentage >= 0 &&
      b.percentage <= 100
    )
      p.percentage = b.percentage;
    if (
      typeof b.numberOfTasks === "number" &&
      Number.isSafeInteger(b.numberOfTasks) &&
      b.numberOfTasks >= 0
    )
      p.numberOfTasks = b.numberOfTasks;
    if (Array.isArray(b.startedTasks))
      p.startedTaskCount = b.startedTasks.length;
    if (typeof b.errorMessage === "string") {
      const m = this.safe.text(b.errorMessage);
      if (m) p.errorMessage = m;
    }
    return p;
  }
}
