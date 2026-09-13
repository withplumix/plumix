import { describe, expect, test, vi } from "vitest";

import type {
  AuthResult,
  RequestAuthenticator,
} from "../auth/authenticator.js";
import type { AppContext, AuthenticatedUser } from "../context/app.js";
import { createTestContext } from "../test/context.js";
import { createDispatcherHarness, plumixRequest } from "../test/dispatcher.js";
import { createTestDb } from "../test/harness.js";
import { loadUserForPublicRequest } from "./load-user-for-public-request.js";

const authenticatedUser: AuthenticatedUser = {
  id: 7,
  email: "editor@example.com",
  role: "editor",
  meta: {},
};

async function publicContext(
  request: Request,
  authenticator: RequestAuthenticator,
): Promise<AppContext> {
  return createTestContext({
    db: await createTestDb(),
    request,
    authenticator,
  });
}

describe("loadUserForPublicRequest", () => {
  test("returns the ctx unchanged and skips authentication when the request has no plumix_session cookie", async () => {
    const authenticate = vi.fn();
    const ctx = await publicContext(new Request("https://example.com/"), {
      authenticate,
    });

    const result = await loadUserForPublicRequest(ctx);

    expect(result).toBe(ctx);
    expect(authenticate).not.toHaveBeenCalled();
  });

  test("returns ctx unchanged when the cookie is present but the authenticator rejects it (expired or orphaned session)", async () => {
    const authenticate = vi.fn().mockResolvedValue(null);
    const ctx = await publicContext(
      new Request("https://example.com/", {
        headers: { Cookie: "plumix_session=stale" },
      }),
      { authenticate },
    );

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
    const ctx = await publicContext(
      new Request("https://example.com/", {
        headers: { Cookie: "plumix_session=abc" },
      }),
      { authenticate },
    );

    const result = await loadUserForPublicRequest(ctx);

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(result.user).toEqual(authenticatedUser);
  });

  // Regression (demo editor was dead): a guard that carries its session by a
  // non-standard signal must still run on public renders — the old gate keyed
  // off the `plumix_session` cookie, so a demo visitor rendered as anonymous
  // (canEdit false → no editor runtime injected → no canvas bridge).
  test("runs a custom authenticator that carries its session without the standard cookie", async () => {
    const authenticate = vi.fn().mockResolvedValue({
      user: authenticatedUser,
      tokenScopes: null,
    });
    const ctx = await publicContext(
      // No `plumix_session` cookie — only the custom guard's own signal.
      new Request("https://example.com/post/hello?plumix.edit", {
        headers: { Cookie: "plumix_demo=session-token" },
      }),
      {
        authenticate,
        hasSession: (request: Request) =>
          (request.headers.get("cookie") ?? "").includes("plumix_demo="),
      },
    );

    const result = await loadUserForPublicRequest(ctx);

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(result.user).toEqual(authenticatedUser);
  });

  test("skips a custom authenticator whose hasSession returns false (no wasted auth on anonymous traffic)", async () => {
    const authenticate = vi.fn();
    const ctx = await publicContext(
      new Request("https://example.com/post/hello", {
        headers: { Cookie: "plumix_demo=session-token" },
      }),
      {
        authenticate,
        hasSession: () => false,
      },
    );

    const result = await loadUserForPublicRequest(ctx);

    expect(result).toBe(ctx);
    expect(authenticate).not.toHaveBeenCalled();
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
