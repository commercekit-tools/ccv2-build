import {
  createCcv2Client,
  TechnicalUserTokenManager,
  Ccv2TransportError,
  type Ccv2Client,
  type Ccv2RequestOptions,
  type Ccv2Response,
} from "@commercekit-tools/ccv2-client";
import type { Inputs } from "./inputs.js";
import type { Runtime } from "./runtime.js";
import type { Sanitizer } from "./security.js";
import { ActionError, invalidResponse } from "./errors.js";

// Build-owned accounting and error translation only; auth, replay and retries live in the package.
export class BuildTransport {
  retryCount = 0;
  pollCount = 0;
  readonly tokens: TechnicalUserTokenManager;
  readonly client: Ccv2Client;
  private tokenAttempts = 0;
  private managementAttempts = 0;
  private operation: "create" | "progress" = "create";
  private authFailure: unknown;
  constructor(
    input: Inputs,
    rt: Runtime,
    readonly signal: AbortSignal,
    private safe: Sanitizer,
  ) {
    const start = rt.now();
    const wallStart = Date.now();
    // The package clock also interprets HTTP-date Retry-After. Keep Action duration monotonic.
    const common = {
      ...rt,
      now: () => wallStart + rt.now() - start,
      sleep: (ms: number, signal?: AbortSignal) =>
        rt.sleep(ms, signal ?? this.signal),
    };
    const credentials = {
      tokenEndpoint: input.tokenEndpoint,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      resource: input.resource,
    };
    this.tokens = new TechnicalUserTokenManager(credentials, {
      runtime: {
        ...common,
        maskSecret: (value) => this.safe.add(value),
        fetch: (...args) => {
          if (this.tokenAttempts++ > 0) this.retryCount++;
          return rt.fetch(...args);
        },
      },
      safetyWindowMs: 60000,
      retry: { maxAttempts: 3 },
    });
    this.client = createCcv2Client({
      baseUrl: input.apiBaseUrl,
      tokens: {
        get: async (signal) => {
          this.tokenAttempts = 0;
          try {
            return await this.tokens.get(signal);
          } catch (error) {
            this.authFailure = error;
            throw error;
          }
        },
        invalidate: () => {
          this.retryCount++;
          this.managementAttempts = 0;
          this.tokens.invalidate();
        },
      },
      secrets: Object.values(credentials),
      runtime: {
        ...common,
        maskSecret: (value) => this.safe.add(value),
        fetch: (...args) => {
          if (this.managementAttempts++ > 0) this.retryCount++;
          if (this.operation === "progress") this.pollCount++;
          return rt.fetch(...args);
        },
      },
    });
  }
  async authenticate() {
    this.tokenAttempts = 0;
    try {
      return await this.tokens.get(this.signal);
    } catch (error) {
      throw this.translate(error, "token");
    }
  }
  async request(
    path: string,
    options: Ccv2RequestOptions,
    operation: "create" | "progress",
  ): Promise<Ccv2Response> {
    this.operation = operation;
    this.managementAttempts = 0;
    this.authFailure = undefined;
    try {
      return await this.client.request(path, {
        ...options,
        signal: this.signal,
        timeoutMs: 30000,
        maxResponseBytes: 262144,
        retry: { maxAttempts: 3 },
      });
    } catch (error) {
      throw this.translate(
        this.authFailure ?? error,
        this.authFailure ? "token" : operation,
      );
    }
  }
  private translate(
    error: unknown,
    operation: "token" | "create" | "progress",
  ): ActionError {
    if (!(error instanceof Ccv2TransportError))
      return new ActionError(
        "INTERNAL_ERROR",
        "The Action encountered an internal error.",
      );
    if (
      ["INVALID_TOKEN", "INVALID_RESPONSE", "RESPONSE_TOO_LARGE"].includes(
        error.code,
      )
    )
      return invalidResponse();
    if (operation === "token" && error.status !== undefined)
      return new ActionError(
        [400, 401, 403].includes(error.status)
          ? "AUTHENTICATION_FAILED"
          : "TOKEN_REQUEST_FAILED",
        "Technical-user authentication failed.",
        error.status,
      );
    if (
      operation === "create" &&
      ["REQUEST_FAILED", "TIMEOUT"].includes(error.code)
    )
      return new ActionError(
        "CREATE_BUILD_AMBIGUOUS",
        "Build creation could have succeeded. Check Cloud Portal before trying again.",
      );
    return new ActionError(
      "REQUEST_FAILED",
      "The API request could not be completed.",
    );
  }
}
