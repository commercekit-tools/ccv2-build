import { ActionError, invalidResponse } from "./errors.js";
import { segment, type Inputs } from "./inputs.js";
import type { Http, Reply } from "./http.js";
import type { TokenManager } from "./auth.js";
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
export interface ProblemResponse {
  title?: string;
  detail?: string;
}
export class BuildApi {
  pollCount = 0;
  constructor(
    private input: Inputs,
    private http: Http,
    private tokens: TokenManager,
    private safe: Sanitizer,
  ) {}
  private async request(buildCode?: string): Promise<Reply> {
    const create = buildCode === undefined;
    const path = `v2/subscriptions/${segment(this.input.subscriptionCode)}/builds${create ? "" : `/${segment(buildCode)}/progress`}`;
    const url = new URL(path, this.input.apiBaseUrl);
    for (let attempt = 0; ; attempt++) {
      const token = await this.tokens.get(attempt === 1);
      const init: RequestInit = {
        method: create ? "POST" : "GET",
        headers: {
          Accept: "application/json",
          "x-approuter-authorization": `Bearer ${token}`,
          ...(create ? { "Content-Type": "application/json" } : {}),
        },
      };
      if (create)
        init.body = JSON.stringify({
          branch: this.input.branch,
          name: this.input.buildName,
          ...(this.input.applicationCode
            ? { applicationCode: this.input.applicationCode }
            : {}),
        });
      let reply: Reply;
      try {
        if (create) reply = await this.http.once(url.href, init);
        else {
          // Count each HTTP progress attempt, including retries and refreshed authorization.
          const counted = new HttpCounter(this.http, () => this.pollCount++);
          reply = await counted.request(url.href, init);
        }
      } catch (error) {
        if (
          create &&
          error instanceof ActionError &&
          error.code === "REQUEST_FAILED"
        )
          throw new ActionError(
            "CREATE_BUILD_AMBIGUOUS",
            "Build creation could have succeeded. Check Cloud Portal before trying again.",
          );
        throw error;
      }
      if (reply.status === 401 && attempt === 0) {
        this.http.retryCount++;
        continue;
      }
      if (reply.status !== (create ? 201 : 200)) {
        const code = create
          ? reply.status >= 500
            ? "CREATE_BUILD_AMBIGUOUS"
            : "CREATE_BUILD_FAILED"
          : "BUILD_PROGRESS_FAILED";
        const parts = [reply.body.title, reply.body.detail]
          .filter((s): s is string => typeof s === "string")
          .map((s) => this.safe.text(s, 400))
          .filter(Boolean);
        throw new ActionError(
          code,
          `CCv2 ${create ? "build creation" : "progress request"} failed (HTTP ${reply.status}).${parts.length ? " " + parts.join(": ") : ""}`,
          reply.status,
        );
      }
      return reply;
    }
  }
  async create(): Promise<CreateBuildResponse> {
    const { body } = await this.request();
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
    const { body: b } = await this.request(code);
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
// Wrap transport without changing token request accounting.
class HttpCounter {
  constructor(
    private http: Http,
    private count: () => void,
  ) {}
  async request(url: string, init: RequestInit): Promise<Reply> {
    const rt = {
      ...this.http.rt,
      fetch: ((...args: Parameters<typeof fetch>) => {
        this.count();
        return this.http.rt.fetch(...args);
      }) as typeof fetch,
    };
    const { Http } = await import("./http.js");
    const proxy = new Http(rt, this.http.signal);
    try {
      return await proxy.safeRequest(url, init);
    } finally {
      this.http.retryCount += proxy.retryCount;
    }
  }
}
