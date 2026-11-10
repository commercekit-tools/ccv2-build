import { it, expect, describe, vi } from "vitest";

import { inputs } from "./fixtures.js";
import { harness, token } from "./harness.js";
describe("technical-user authentication", () => {
  it("encodes form, masks token, uses HTTPS without redirects", async () => {
    const h = harness([token]);
    expect(await h.tokens.get()).toBe(token.access_token);
    const [url, init] = h.fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(inputs().tokenEndpoint);
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    });
    expect(
      Object.fromEntries(new URLSearchParams(init.body as string)),
    ).toEqual({
      client_id: "FAKE_CLIENT_ID",
      client_secret: "FAKE_CLIENT_SECRET",
      resource: "FAKE_RESOURCE",
      grant_type: "client_credentials",
    });
    expect(h.safe.contains(token.access_token)).toBe(true);
  });
  it("reuses and proactively refreshes", async () => {
    const h = harness([token, token]);
    await h.tokens.get();
    await h.tokens.get();
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    h.advance(3540001);
    await h.tokens.get();
    expect(h.fetcher).toHaveBeenCalledTimes(2);
  });
  it("missing expiry reuses until explicit refresh; lowercase Bearer accepted", async () => {
    const h = harness([
      { ...token, expires_in: undefined, token_type: "bearer" },
      token,
    ]);
    await h.tokens.get();
    h.advance(1e9);
    await h.tokens.get();
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    await h.tokens.get(true);
    expect(h.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    {},
    { ...token, access_token: "" },
    { ...token, access_token: "a b" },
    { ...token, token_type: "Basic" },
    { ...token, expires_in: 0 },
    { ...token, expires_in: 1.5 },
  ])("rejects malformed token", async (t) => {
    const h = harness([t]);
    await expect(h.tokens.get()).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
    });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 403])("does not retry permanent %i", async (status) => {
    const h = harness([
      Response.json({ error: "invalid_resource" }, { status }),
    ]);
    await expect(h.tokens.get()).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      httpStatus: status,
    });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500, 502, 503, 504])("retries transient %i", async (status) => {
    const h = harness([
      Response.json({}, { status, headers: { "Retry-After": "2" } }),
      token,
    ]);
    await h.tokens.get();
    expect(h.http.retryCount).toBe(1);
    expect(h.rt.sleep).toHaveBeenCalledWith(2000, h.http.signal);
  });
  it("retries network, stops at three", async () => {
    const h = harness([
      new Error("secret"),
      new Error("secret"),
      new Error("secret"),
    ]);
    await expect(h.tokens.get()).rejects.toMatchObject({
      code: "REQUEST_FAILED",
    });
    expect(h.fetcher).toHaveBeenCalledTimes(3);
  });
  it("normalizes exhausted token HTTP errors", async () => {
    const h = harness(
      Array.from({ length: 3 }, () => Response.json({}, { status: 503 })),
    );
    await expect(h.tokens.get()).rejects.toMatchObject({
      code: "TOKEN_REQUEST_FAILED",
    });
  });
});
describe("build API and retry safety", () => {
  it("creates then reads progress; omits applicationCode", async () => {
    const h = harness([
      token,
      { code: "synthetic.1" },
      {
        buildStatus: "SUCCESS",
        percentage: 100,
        numberOfTasks: 2,
        startedTasks: [{}, {}],
      },
    ]);
    await expect(h.api.create()).resolves.toEqual({ code: "synthetic.1" });
    await expect(h.api.progress("synthetic.1")).resolves.toEqual({
      buildStatus: "SUCCESS",
      percentage: 100,
      numberOfTasks: 2,
      startedTaskCount: 2,
    });
    const call = h.fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(call[0]).toBe(
      "https://portalapi.commerce.ondemand.com/v2/subscriptions/synthetic-subscription/builds",
    );
    expect(JSON.parse(call[1].body as string)).toEqual({
      branch: "feature/test",
      name: "synthetic-build",
    });
    expect(call[1].headers).toHaveProperty(
      "x-approuter-authorization",
      "Bearer FAKE_ACCESS_TOKEN",
    );
    expect(call[1].headers).not.toHaveProperty("Authorization");
    expect(h.api.pollCount).toBe(1);
  });
  it.each([400, 409, 429, 500])(
    "does not retry creation %i",
    async (status) => {
      const h = harness([
        token,
        Response.json(
          { title: "Synthetic problem", detail: "FAKE_ACCESS_TOKEN" },
          { status, headers: { "content-type": "application/problem+json" } },
        ),
      ]);
      await expect(h.api.create()).rejects.toMatchObject({
        code: status === 500 ? "CREATE_BUILD_AMBIGUOUS" : "CREATE_BUILD_FAILED",
        httpStatus: status,
      });
      expect(h.fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it("does not retry ambiguous transport", async () => {
    const h = harness([token, new Error("lost response")]);
    await expect(h.api.create()).rejects.toMatchObject({
      code: "CREATE_BUILD_AMBIGUOUS",
    });
    expect(h.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([{}, { code: "../x" }, { code: "x", subscriptionCode: "wrong" }])(
    "rejects malformed creation",
    async (b) => {
      const h = harness([token, b]);
      await expect(h.api.create()).rejects.toMatchObject({
        code: "INVALID_API_RESPONSE",
      });
    },
  );
  it.each(["create", "progress"] as const)(
    "refreshes only once on %s 401",
    async (operation) => {
      const h = harness([
        token,
        Response.json({}, { status: 401 }),
        token,
        Response.json({}, { status: 401 }),
      ]);
      await expect(
        operation === "create" ? h.api.create() : h.api.progress("synthetic.1"),
      ).rejects.toMatchObject({ httpStatus: 401 });
      expect(h.fetcher).toHaveBeenCalledTimes(4);
    },
  );
  it.each(["create", "progress"] as const)(
    "succeeds after %s 401 refresh",
    async (operation) => {
      const h = harness([
        token,
        Response.json({}, { status: 401 }),
        token,
        operation === "create"
          ? { code: "synthetic.1" }
          : { buildStatus: "SUCCESS" },
      ]);
      await (operation === "create"
        ? h.api.create()
        : h.api.progress("synthetic.1"));
      expect(h.http.retryCount).toBe(1);
    },
  );
  it.each([429, 503, "network"])("retries safe progress %s", async (status) => {
    const h = harness([
      token,
      status === "network"
        ? new Error()
        : Response.json({}, { status: Number(status) }),
      { buildStatus: "BUILDING" },
    ]);
    await h.api.progress("synthetic.1");
    expect(h.api.pollCount).toBe(2);
    expect(h.http.retryCount).toBe(1);
  });
  it("rejects unknown enum and mismatched identity", async () => {
    for (const b of [
      { buildStatus: "NEW" },
      { buildStatus: "SUCCESS", buildCode: "wrong" },
      { buildStatus: "FAIL", subscriptionCode: "wrong" },
    ]) {
      const h = harness([token, b]);
      await expect(h.api.progress("synthetic.1")).rejects.toThrow();
    }
  });
  it("omits invalid optional progress fields", async () => {
    const h = harness([
      token,
      {
        buildStatus: "FAIL",
        percentage: 101,
        numberOfTasks: -1,
        errorMessage: "<b>synthetic failure</b>",
      },
    ]);
    expect(await h.api.progress("synthetic.1")).toEqual({
      buildStatus: "FAIL",
      errorMessage: "synthetic failure",
    });
  });
});
it("production runtime delegates fetch, monotonic clock, and abortable timers", async () => {
  const { runtime } = await import("../src/runtime.js");
  const mocked = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({}));
  expect(runtime.now()).toBeGreaterThanOrEqual(0);
  await runtime.fetch("https://example.invalid");
  expect(mocked).toHaveBeenCalledOnce();
  await runtime.sleep(1, new AbortController().signal);
  mocked.mockRestore();
});
it("includes optional application and sanitizes empty error text", async () => {
  const { BuildApi } = await import("../src/api.js");
  const h = harness([
    token,
    { code: "synthetic.1", subscriptionCode: "synthetic-subscription" },
    { buildStatus: "FAIL", errorMessage: "<b></b>" },
  ]);
  const api = new BuildApi(
    { ...inputs(), applicationCode: "synthetic-app" },
    h.http,
    h.safe,
  );
  await api.create();
  expect(h.fetcher.mock.calls[1]![1].body).toContain("applicationCode");
  expect(await api.progress("synthetic.1")).not.toHaveProperty("errorMessage");
});
it("preserves invalid response error during create without replay", async () => {
  const h = harness([token, new Response("bad", { status: 201 })]);
  await expect(h.api.create()).rejects.toMatchObject({
    code: "INVALID_API_RESPONSE",
  });
  expect(h.fetcher).toHaveBeenCalledTimes(2);
});
it("times out a pending request after 30 seconds without exposing transport errors", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    const h = harness([token]);
    await h.tokens.get();
    h.rt.fetch = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) =>
          init!.signal!.addEventListener("abort", () =>
            reject(Error("FAKE_TRANSPORT_SECRET")),
          ),
        ),
    );
    const pending = h.api.create();
    const assertion = expect(pending).rejects.toMatchObject({
      code: "CREATE_BUILD_AMBIGUOUS",
      message:
        "Build creation could have succeeded. Check Cloud Portal before trying again.",
    });
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});
it("selects explicit mutation and safe-read policies", async () => {
  const h = harness([
    token,
    { code: "synthetic.1" },
    { buildStatus: "SUCCESS" },
  ]);
  const request = vi.spyOn(h.http.client, "request");
  await h.api.create();
  await h.api.progress("synthetic.1");
  expect(request.mock.calls[0]![1]).toMatchObject({
    policy: "unsafe-mutation",
    refreshOn401: true,
    timeoutMs: 30000,
  });
  expect(request.mock.calls[1]![1]).toMatchObject({
    policy: "safe-read",
    refreshOn401: true,
  });
});
it.each(["create", "progress"] as const)(
  "rejects array, empty and binary %s bodies without retry",
  async (operation) => {
    for (const body of [
      Response.json([], { status: operation === "create" ? 201 : 200 }),
      new Response(null, { status: operation === "create" ? 201 : 200 }),
      new Response("synthetic binary", {
        status: operation === "create" ? 201 : 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    ]) {
      const h = harness([token, body]);
      await expect(
        operation === "create" ? h.api.create() : h.api.progress("synthetic.1"),
      ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
      expect(h.fetcher).toHaveBeenCalledTimes(2);
    }
  },
);
it("preserves authentication classification when a 401 refresh fails", async () => {
  const h = harness([
    token,
    Response.json({}, { status: 401 }),
    Response.json({}, { status: 403 }),
  ]);
  await expect(h.api.create()).rejects.toMatchObject({
    code: "AUTHENTICATION_FAILED",
    httpStatus: 403,
  });
  expect(h.fetcher).toHaveBeenCalledTimes(3);
  expect(h.http.retryCount).toBe(1); // Preserve authorization refresh accounting even if refresh fails.
});
it("counts token retries separately from progress attempts and honors HTTP-date Retry-After", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-01-01T00:00:00Z"));
  try {
    const h = harness([
      Response.json({}, { status: 503 }),
      token,
      Response.json(
        {},
        {
          status: 429,
          headers: { "retry-after": "Thu, 01 Jan 2026 00:00:04 GMT" },
        },
      ),
      { buildStatus: "SUCCESS" },
    ]);
    await h.api.progress("synthetic.1");
    expect(h.http.retryCount).toBe(2);
    expect(h.api.pollCount).toBe(2);
    expect(h.rt.sleep).toHaveBeenLastCalledWith(3000, h.http.signal);
  } finally {
    vi.restoreAllMocks();
  }
});
it("preserves exhausted progress HTTP status and rejects oversized success", async () => {
  const h = harness([
    token,
    ...Array.from({ length: 3 }, () => Response.json({}, { status: 503 })),
  ]);
  await expect(h.api.progress("synthetic.1")).rejects.toMatchObject({
    code: "BUILD_PROGRESS_FAILED",
    httpStatus: 503,
  });
  expect(h.api.pollCount).toBe(3);
  const large = harness([
    token,
    new Response("x".repeat(262145), { status: 201 }),
  ]);
  await expect(large.api.create()).rejects.toMatchObject({
    code: "INVALID_API_RESPONSE",
  });
  expect(large.fetcher).toHaveBeenCalledTimes(2);
});
it("normalizes unexpected adapter errors without serializing them", async () => {
  const h = harness([]);
  vi.spyOn(h.http.client, "request").mockRejectedValue(
    new Error("FAKE_INTERNAL_SECRET"),
  );
  await expect(h.api.create()).rejects.toMatchObject({
    code: "INTERNAL_ERROR",
    message: "The Action encountered an internal error.",
  });
});
it("aborts pending progress and does not issue another request", async () => {
  const h = harness([token]);
  await h.tokens.get();
  const { BuildTransport } = await import("../src/transport.js");
  const { BuildApi } = await import("../src/api.js");
  const controller = new AbortController();
  controller.abort();
  const transport = new BuildTransport(
    inputs(),
    h.rt,
    controller.signal,
    h.safe,
  );
  const api = new BuildApi(inputs(), transport, h.safe);
  await expect(api.progress("synthetic.1")).rejects.toMatchObject({
    code: "REQUEST_FAILED",
  });
  expect(h.fetcher).toHaveBeenCalledTimes(1);
});
