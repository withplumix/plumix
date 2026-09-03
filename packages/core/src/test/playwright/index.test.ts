import type { Page, Route } from "@playwright/test";
import { describe, expect, test } from "vitest";

import type { PlumixManifest } from "../../plugin/manifest.js";
import {
  anonymousSession,
  AUTHED_ADMIN,
  emptyManifest,
  mockManifest,
  rpcErrorBody,
  rpcOkBody,
  withCapabilities,
} from "./index.js";

describe("anonymousSession", () => {
  test("defaults to needsBootstrap=false (login screen)", () => {
    expect(anonymousSession()).toEqual({ user: null, needsBootstrap: false });
  });

  test("flips to needsBootstrap=true for the first-admin flow", () => {
    expect(anonymousSession(true)).toEqual({
      user: null,
      needsBootstrap: true,
    });
  });
});

describe("withCapabilities", () => {
  test("appends capabilities and returns a fresh object", () => {
    const next = withCapabilities(AUTHED_ADMIN, "media:upload");
    expect(next).not.toBe(AUTHED_ADMIN);
    expect(next.user).not.toBe(AUTHED_ADMIN.user);
    expect(next.user?.capabilities).toContain("media:upload");
    // Original baseline cap still present
    expect(next.user?.capabilities).toContain("settings:manage");
  });

  test("doesn't mutate the input", () => {
    const before = AUTHED_ADMIN.user?.capabilities.length ?? 0;
    withCapabilities(AUTHED_ADMIN, "x");
    expect(AUTHED_ADMIN.user?.capabilities.length).toBe(before);
  });

  test("accepts multiple caps via rest args", () => {
    const next = withCapabilities(AUTHED_ADMIN, "a", "b", "c");
    expect(next.user?.capabilities).toEqual(
      expect.arrayContaining(["a", "b", "c"]),
    );
  });

  test("throws on anonymous session — adding caps to no user is a test bug", () => {
    expect(() => withCapabilities(anonymousSession(), "x")).toThrow(
      /anonymous session/i,
    );
  });
});

describe("rpcOkBody", () => {
  test("wraps payload in oRPC envelope", () => {
    expect(rpcOkBody({ id: 1, name: "x" })).toBe(
      '{"json":{"id":1,"name":"x"},"meta":[]}',
    );
  });

  test("coerces undefined → null so the envelope stays well-formed", () => {
    // Without coercion, JSON.stringify drops the `json` key entirely
    // and the envelope becomes `{"meta":[]}` — an oRPC client would
    // mis-interpret as a missing field.
    expect(rpcOkBody(undefined)).toBe('{"json":null,"meta":[]}');
  });

  test("preserves explicit null", () => {
    expect(rpcOkBody(null)).toBe('{"json":null,"meta":[]}');
  });

  test("handles arrays", () => {
    expect(rpcOkBody([1, 2, 3])).toBe('{"json":[1,2,3],"meta":[]}');
  });
});

describe("rpcErrorBody", () => {
  test("wraps an error envelope", () => {
    const out = rpcErrorBody({ code: "FORBIDDEN", message: "no" });
    expect(JSON.parse(out)).toEqual({
      json: { code: "FORBIDDEN", message: "no" },
      meta: [],
    });
  });

  test("preserves the data field", () => {
    const out = rpcErrorBody({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
    expect(JSON.parse(out)).toMatchObject({
      json: { code: "CONFLICT", data: { reason: "slug_taken" } },
    });
  });
});

describe("AUTHED_ADMIN", () => {
  test("has a baseline admin user with the bare-install capabilities", () => {
    expect(AUTHED_ADMIN.user?.role).toBe("admin");
    expect(AUTHED_ADMIN.user?.capabilities).toEqual(
      expect.arrayContaining(["settings:manage", "plugin:manage", "user:list"]),
    );
  });

  test("needsBootstrap is false (the admin already exists)", () => {
    expect(AUTHED_ADMIN.needsBootstrap).toBe(false);
  });
});

describe("mockManifest", () => {
  // What `vite preview` actually sends for the admin document.
  const ORIGIN_HEADERS = {
    "cache-control": "no-cache",
    "content-encoding": "gzip",
    "content-length": "6582",
    "content-type": "text/html",
    etag: 'W/"19b6-Y+r28AUOyZujO8+Cm8H0cxstmTU"',
    "transfer-encoding": "chunked",
    vary: "Origin",
  };

  const DOC_HTML = `<!doctype html><html><head><script id="plumix-manifest" type="application/json">{"old":true}</script></head><body></body></html>`;

  /**
   * `mockManifest` registers a catch-all route handler; capture it so
   * each test can drive it with a hand-rolled `Route` and simulate the
   * teardown races that only surface under full-suite parallel load.
   */
  async function captureHandler(
    manifest: PlumixManifest = emptyManifest(),
  ): Promise<(route: Route) => Promise<void>> {
    let handler: ((route: Route) => Promise<void>) | undefined;
    const page = {
      route: (_pattern: string, fn: (route: Route) => Promise<void>) => {
        handler = fn;
        return Promise.resolve();
      },
    } as unknown as Page;
    await mockManifest(page, manifest);
    if (!handler) throw new Error("mockManifest registered no route handler");
    return handler;
  }

  interface FulfillCall {
    body?: string;
    headers?: Record<string, string>;
  }

  function routeStub(
    overrides: {
      resourceType?: string;
      fetch?: () => Promise<unknown>;
      text?: () => Promise<string>;
      fulfill?: () => Promise<void>;
      fallback?: () => Promise<void>;
      headers?: Record<string, string>;
    } = {},
  ) {
    const calls = { fulfilled: [] as FulfillCall[], fellBack: 0 };
    const response = {
      text: overrides.text ?? (() => Promise.resolve(DOC_HTML)),
      headers: () => overrides.headers ?? { ...ORIGIN_HEADERS },
      status: () => 200,
    };
    const route = {
      request: () => ({
        resourceType: () => overrides.resourceType ?? "document",
      }),
      fetch: overrides.fetch ?? (() => Promise.resolve(response)),
      fulfill:
        overrides.fulfill ??
        ((opts: FulfillCall) => {
          calls.fulfilled.push(opts);
          return Promise.resolve();
        }),
      fallback:
        overrides.fallback ??
        (() => {
          calls.fellBack += 1;
          return Promise.resolve();
        }),
    } as unknown as Route;
    return { route, calls };
  }

  const disposed = () =>
    Promise.reject(new Error("Response has been disposed"));
  const targetClosed = () =>
    Promise.reject(
      new Error("Target page, context or browser has been closed"),
    );
  // The real error appends a browser-log dump after the wording, so the
  // fixture keeps the tail the match has to survive.
  const testEnded = () =>
    Promise.reject(
      new Error("route.fetch: Test ended.\nBrowser logs:\n\n<launching> ..."),
    );

  test("rewrites the manifest tag on the happy path", async () => {
    const handler = await captureHandler();
    const { route, calls } = routeStub();
    await handler(route);
    expect(calls.fulfilled).toHaveLength(1);
    expect(calls.fulfilled[0]?.body).toContain(`id="plumix-manifest"`);
    expect(calls.fulfilled[0]?.body).not.toContain(`{"old":true}`);
  });

  test("escapes sequences that would close the script tag early", async () => {
    const handler = await captureHandler({
      ...emptyManifest(),
      i18n: { defaultLocale: "</script><!--", locales: [] },
    });
    const { route, calls } = routeStub();
    await handler(route);
    const body = calls.fulfilled[0]?.body ?? "";
    expect(body).toContain("<\\/script>");
    expect(body).not.toContain("</script><!--");
  });

  test("falls back on non-document requests", async () => {
    const handler = await captureHandler();
    const { route, calls } = routeStub({ resourceType: "script" });
    await handler(route);
    expect(calls.fulfilled).toHaveLength(0);
    expect(calls.fellBack).toBe(1);
  });

  test("recovers when the response is disposed during the body read", async () => {
    const handler = await captureHandler();
    const { route, calls } = routeStub({ text: disposed });
    await expect(handler(route)).resolves.toBeUndefined();
    expect(calls.fellBack).toBe(1);
    expect(calls.fulfilled).toHaveLength(0);
  });

  test("recovers when the fetch itself is disposed", async () => {
    const handler = await captureHandler();
    const { route, calls } = routeStub({ fetch: disposed });
    await expect(handler(route)).resolves.toBeUndefined();
    expect(calls.fellBack).toBe(1);
  });

  test("recovers when the page closes during fulfill", async () => {
    const handler = await captureHandler();
    const { route, calls } = routeStub({ fulfill: targetClosed });
    await expect(handler(route)).resolves.toBeUndefined();
    expect(calls.fellBack).toBe(1);
  });

  test("recovers when the fetch races the end of the test", async () => {
    const handler = await captureHandler();
    const { route, calls } = routeStub({ fetch: testEnded });
    await expect(handler(route)).resolves.toBeUndefined();
    expect(calls.fellBack).toBe(1);
  });

  test("stays quiet when the fallback also races the end of the test", async () => {
    // Rethrowing here would fail a worker for a test that already finished.
    const handler = await captureHandler();
    let attempted = 0;
    const { route } = routeStub({
      fetch: testEnded,
      fallback: () => {
        attempted += 1;
        return testEnded();
      },
    });
    await expect(handler(route)).resolves.toBeUndefined();
    expect(attempted).toBe(1);
  });

  test("stays quiet when an asset request races the end of the test", async () => {
    // `**/*` sends every script, stylesheet and image down the early return,
    // so that lone `fallback` meets this race far more often than the
    // document path the rest of these tests drive.
    const handler = await captureHandler();
    let attempted = 0;
    const { route } = routeStub({
      resourceType: "script",
      fallback: () => {
        attempted += 1;
        return testEnded();
      },
    });
    await expect(handler(route)).resolves.toBeUndefined();
    expect(attempted).toBe(1);
  });

  test("forwards only the headers that still describe the body", async () => {
    // Framing and validator headers describe the original bytes, so
    // forwarding them would mislabel a decoded, resized document.
    const handler = await captureHandler();
    const { route, calls } = routeStub();
    await handler(route);
    expect(Object.keys(calls.fulfilled[0]?.headers ?? {}).sort()).toEqual([
      "cache-control",
      "content-type",
      "vary",
    ]);
  });

  test("rethrows anything that isn't a teardown race", async () => {
    // Swallowing these would no-op the manifest mock and resurface as
    // an unrelated assertion failure later in the spec.
    const handler = await captureHandler();
    const { route, calls } = routeStub({
      text: () => Promise.reject(new Error("boom")),
    });
    await expect(handler(route)).rejects.toThrow("boom");
    expect(calls.fellBack).toBe(0);
  });
});
