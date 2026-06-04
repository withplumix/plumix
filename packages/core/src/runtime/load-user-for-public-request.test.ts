import { describe, expect, test, vi } from "vitest";

import type { AuthResult } from "../auth/authenticator.js";
import type { AppContext, AuthenticatedUser } from "../context/app.js";
import { resolveLocales } from "../i18n/locale-registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createDispatcherHarness, plumixRequest } from "../test/dispatcher.js";
import { loadUserForPublicRequest } from "./load-user-for-public-request.js";

const i18n = resolveLocales({ defaultLocale: "en", locales: ["en"] });

const authenticatedUser: AuthenticatedUser = {
  id: 7,
  email: "editor@example.com",
  role: "editor",
  meta: {},
};

describe("loadUserForPublicRequest", () => {
  test("returns the ctx unchanged and skips authentication when the request has no plumix_session cookie", async () => {
    const authenticate = vi.fn();
    const ctx = {
      request: new Request("https://example.com/"),
      user: null,
      authenticator: { authenticate },
    } as unknown as AppContext;

    const result = await loadUserForPublicRequest(ctx);

    expect(result).toBe(ctx);
    expect(authenticate).not.toHaveBeenCalled();
  });

  test("returns ctx unchanged when the cookie is present but the authenticator rejects it (expired or orphaned session)", async () => {
    const authenticate = vi.fn().mockResolvedValue(null);
    const ctx = {
      request: new Request("https://example.com/", {
        headers: { Cookie: "plumix_session=stale" },
      }),
      db: {},
      user: null,
      plugins: createPluginRegistry(),
      i18n,
      authenticator: { authenticate },
    } as unknown as AppContext;

    const result = await loadUserForPublicRequest(ctx);

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(result).toBe(ctx);
    expect(result.user).toBeNull();
  });

  test("authenticates once and returns ctx with user populated when the request carries a plumix_session cookie", async () => {
    const authenticate = vi.fn().mockResolvedValue({
      user: authenticatedUser,
      tokenScopes: null,
    });
    const ctx = {
      request: new Request("https://example.com/", {
        headers: { Cookie: "plumix_session=abc" },
      }),
      db: {},
      user: null,
      plugins: createPluginRegistry(),
      i18n,
      authenticator: { authenticate },
    } as unknown as AppContext;

    const result = await loadUserForPublicRequest(ctx);

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(result.user).toEqual(authenticatedUser);
  });
});

describe("dispatchPublicRoute → loadUserForPublicRequest wiring", () => {
  test("anonymous public request never invokes the authenticator (zero added DB hits)", async () => {
    const authenticate =
      vi.fn<(request: Request) => Promise<AuthResult | null>>();
    const h = await createDispatcherHarness({
      authenticator: { authenticate },
    });

    await h.dispatch(plumixRequest("/", { method: "GET" }));

    expect(authenticate).not.toHaveBeenCalled();
  });

  test("authenticated public request invokes the authenticator exactly once", async () => {
    const authenticate = vi.fn<
      (request: Request) => Promise<AuthResult | null>
    >(() => Promise.resolve(null));
    const h = await createDispatcherHarness({
      authenticator: { authenticate },
    });
    const user = await h.seedUser("editor");
    const request = await h.authenticateRequest(
      plumixRequest("/", { method: "GET" }),
      user.id,
    );

    await h.dispatch(request);

    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  test("authenticator throwing on a public request degrades through the existing error boundary instead of escaping the dispatcher", async () => {
    const h = await createDispatcherHarness({
      authenticator: {
        authenticate: () => Promise.reject(new Error("db blip")),
      },
    });
    const user = await h.seedUser("editor");
    const request = await h.authenticateRequest(
      plumixRequest("/", { method: "GET" }),
      user.id,
    );

    const response = await h.dispatch(request);

    expect(response.status).toBe(500);
  });
});
