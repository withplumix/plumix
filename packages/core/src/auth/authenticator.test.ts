import { describe, expect, test } from "vitest";

import type { User } from "../db/schema/users.js";
import type { AuthResult, RequestAuthenticator } from "./authenticator.js";
import { createTestContext } from "../test/context.js";
import { userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { createApiToken } from "./api-tokens.js";
import {
  apiTokenAuthenticator,
  authenticateSession,
  chainAuthenticators,
  defaultAuthenticator,
  requestHasSession,
  sessionAuthenticator,
  tokenScopesOf,
} from "./authenticator.js";
import { SESSION_COOKIE_NAME } from "./cookies.js";
import { createSession } from "./sessions.js";

describe("sessionAuthenticator", () => {
  test("returns null when the request has no session cookie", async () => {
    const db = await createTestDb();
    const request = new Request("https://cms.example/admin");

    const user = await sessionAuthenticator().authenticate(request, db, {
      startingUserMeta: {},
    });
    expect(user).toBeNull();
  });

  test("returns null for a malformed / unknown cookie", async () => {
    const db = await createTestDb();
    const request = new Request("https://cms.example/admin", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-real-token` },
    });

    const user = await sessionAuthenticator().authenticate(request, db, {
      startingUserMeta: {},
    });
    expect(user).toBeNull();
  });

  test("returns the user for a valid session cookie", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });
    const { token } = await createSession(db, { userId: seeded.id });
    const request = new Request("https://cms.example/admin", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    const result = await sessionAuthenticator().authenticate(request, db, {
      startingUserMeta: {},
    });
    expect(result?.user.id).toBe(seeded.id);
    expect(result?.user.email).toBe("alice@example.com");
    expect(result?.credential).toBe("session");
  });
});

describe("apiTokenAuthenticator", () => {
  test("returns null when no Authorization header is present", async () => {
    const db = await createTestDb();
    const request = new Request("https://cms.example/admin");

    const user = await apiTokenAuthenticator().authenticate(request, db, {
      startingUserMeta: {},
    });
    expect(user).toBeNull();
  });

  test("returns null when the header isn't `Bearer …`", async () => {
    const db = await createTestDb();
    const request = new Request("https://cms.example/admin", {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });

    const user = await apiTokenAuthenticator().authenticate(request, db, {
      startingUserMeta: {},
    });
    expect(user).toBeNull();
  });

  test("returns the user for a valid bearer token", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: "bot@cms.example",
      role: "editor",
    });
    const { secret } = await createApiToken(db, {
      userId: seeded.id,
      name: "ci",
      expiresAt: null,
    });
    const request = new Request("https://cms.example/admin", {
      headers: { authorization: `Bearer ${secret}` },
    });

    const result = await apiTokenAuthenticator().authenticate(request, db, {
      startingUserMeta: {},
    });
    expect(result?.user.id).toBe(seeded.id);
    // Default-minted token (no `scopes` arg) is unrestricted (null).
    expect(result).toMatchObject({
      credential: "api-token",
      tokenScopes: null,
    });
  });

  test("surfaces tokenScopes when the token has them", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({});
    const { secret } = await createApiToken(db, {
      userId: seeded.id,
      name: "scoped",
      expiresAt: null,
      scopes: ["entry:post:read", "settings:manage"],
    });
    const request = new Request("https://cms.example/admin", {
      headers: { authorization: `Bearer ${secret}` },
    });

    const result = await apiTokenAuthenticator().authenticate(request, db, {
      startingUserMeta: {},
    });
    expect(result).toMatchObject({
      credential: "api-token",
      tokenScopes: ["entry:post:read", "settings:manage"],
    });
  });

  test("returns null for an unknown token", async () => {
    const db = await createTestDb();
    const request = new Request("https://cms.example/admin", {
      headers: { authorization: "Bearer pl_pat_unknownsecret" },
    });

    const result = await apiTokenAuthenticator().authenticate(request, db, {
      startingUserMeta: {},
    });
    expect(result).toBeNull();
  });
});

describe("chainAuthenticators / defaultAuthenticator", () => {
  test("first non-null wins, later authenticators are short-circuited", async () => {
    const db = await createTestDb();
    const userA = await userFactory.transient({ db }).create({});
    const userB = await userFactory.transient({ db }).create({});

    let secondCalled = false;
    const first: RequestAuthenticator = {
      authenticate: () =>
        Promise.resolve({ user: userA, credential: "session" }),
    };
    const second: RequestAuthenticator = {
      authenticate: () => {
        secondCalled = true;
        return Promise.resolve({ user: userB, credential: "session" });
      },
    };

    const result = await chainAuthenticators(first, second).authenticate(
      new Request("https://cms.example/"),
      db,
      { startingUserMeta: {} },
    );
    expect(result?.user.id).toBe(userA.id);
    expect(secondCalled).toBe(false);
  });

  test("falls through to a later authenticator when the first returns null", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({});

    const empty: RequestAuthenticator = {
      authenticate: () => Promise.resolve(null),
    };
    const fallback: RequestAuthenticator = {
      authenticate: () =>
        Promise.resolve({ user: seeded, credential: "session" }),
    };

    const result = await chainAuthenticators(empty, fallback).authenticate(
      new Request("https://cms.example/"),
      db,
      { startingUserMeta: {} },
    );
    expect(result?.user.id).toBe(seeded.id);
  });

  test("signOutUrl returns the first authenticator's value", () => {
    const a: RequestAuthenticator = {
      authenticate: () => Promise.resolve(null),
      signOutUrl: () => "https://idp.example/logout",
    };
    const b: RequestAuthenticator = {
      authenticate: () => Promise.resolve(null),
      signOutUrl: () => "https://other.example/logout",
    };

    expect(
      chainAuthenticators(a, b).signOutUrl?.(
        new Request("https://cms.example/"),
      ),
    ).toBe("https://idp.example/logout");
  });

  test("signOutUrl falls through past authenticators that don't expose one", () => {
    const a: RequestAuthenticator = {
      authenticate: () => Promise.resolve(null),
    };
    const b: RequestAuthenticator = {
      authenticate: () => Promise.resolve(null),
      signOutUrl: () => "https://idp.example/logout",
    };

    expect(
      chainAuthenticators(a, b).signOutUrl?.(
        new Request("https://cms.example/"),
      ),
    ).toBe("https://idp.example/logout");
  });

  test("signOutUrl forwards the request to each authenticator", () => {
    const a: RequestAuthenticator = {
      authenticate: () => Promise.resolve(null),
      signOutUrl: (request) =>
        request.headers.has("x-idp-a") ? "https://a.example/logout" : null,
    };
    const b: RequestAuthenticator = {
      authenticate: () => Promise.resolve(null),
      signOutUrl: (request) =>
        request.headers.has("x-idp-b") ? "https://b.example/logout" : null,
    };
    const request = new Request("https://cms.example/", {
      headers: { "x-idp-b": "1" },
    });

    expect(chainAuthenticators(a, b).signOutUrl?.(request)).toBe(
      "https://b.example/logout",
    );
  });

  test("default chain authenticates via session cookie", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({});
    const { token } = await createSession(db, { userId: seeded.id });
    const request = new Request("https://cms.example/admin", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    const result = await defaultAuthenticator().authenticate(request, db, {
      startingUserMeta: {},
    });
    expect(result?.user.id).toBe(seeded.id);
  });

  test("default chain authenticates via bearer token when no session cookie is present", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({});
    const { secret } = await createApiToken(db, {
      userId: seeded.id,
      name: "mcp",
      expiresAt: null,
    });
    const request = new Request("https://cms.example/admin", {
      headers: { authorization: `Bearer ${secret}` },
    });

    const result = await defaultAuthenticator().authenticate(request, db, {
      startingUserMeta: {},
    });
    expect(result?.user.id).toBe(seeded.id);
  });
});

describe("RequestAuthenticator interface", () => {
  test("a one-method custom authenticator slots in", async () => {
    // Smoke test for the contract — any object satisfying the interface
    // can replace the default. Mirrors how `cfAccess()` (a future
    // factory) will be shaped: pure function from request → user.
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: "trusted@enterprise.example",
      role: "admin",
    });

    const headerAuth: RequestAuthenticator = {
      authenticate(request) {
        const email = request.headers.get("x-trusted-email");
        if (!email) return Promise.resolve(null);
        return Promise.resolve({ user: seeded, credential: "session" });
      },
    };

    const ok = await headerAuth.authenticate(
      new Request("https://cms.example/", {
        headers: { "x-trusted-email": "trusted@enterprise.example" },
      }),
      db,
      { startingUserMeta: {} },
    );
    expect(ok?.user.id).toBe(seeded.id);

    const empty = await headerAuth.authenticate(
      new Request("https://cms.example/"),
      db,
      { startingUserMeta: {} },
    );
    expect(empty).toBeNull();
  });
});

/**
 * `hasSession` gates whether the public-render path runs the authenticator
 * at all (see loadUserForPublicRequest) — a non-cookie authenticator must be
 * able to opt in, or a signed-in visitor renders as anonymous.
 */
const carriesReq = (headers?: HeadersInit): Request =>
  new Request("https://cms.example/post/hello", headers ? { headers } : {});

describe("hasSession", () => {
  const req = carriesReq;

  test("sessionAuthenticator carries a session iff the standard cookie is present", () => {
    const auth = sessionAuthenticator();
    expect(auth.hasSession?.(req())).toBe(false);
    expect(
      auth.hasSession?.(req({ cookie: `${SESSION_COOKIE_NAME}=abc` })),
    ).toBe(true);
  });

  test("apiTokenAuthenticator never carries a public-render session (bearer is an API client)", () => {
    const auth = apiTokenAuthenticator();
    expect(auth.hasSession?.(req())).toBe(false);
    expect(auth.hasSession?.(req({ authorization: "Bearer pl_pat_x" }))).toBe(
      false,
    );
  });

  test("chainAuthenticators carries a session when any member does", () => {
    const auth = defaultAuthenticator(); // session + apiToken
    expect(auth.hasSession?.(req())).toBe(false);
    expect(
      auth.hasSession?.(req({ cookie: `${SESSION_COOKIE_NAME}=abc` })),
    ).toBe(true);
    // A custom cookie-based authenticator in the chain is honored, not just the
    // default.
    const custom: RequestAuthenticator = {
      authenticate: () => Promise.resolve(null),
      hasSession: (request) => request.headers.get("cookie") === "demo=1",
    };
    const chained = chainAuthenticators(custom);
    expect(chained.hasSession?.(req({ cookie: "demo=1" }))).toBe(true);
    expect(chained.hasSession?.(req({ cookie: "other=1" }))).toBe(false);
  });
});

describe("requestHasSession", () => {
  const req = carriesReq;

  test("delegates to an authenticator's own hasSession (custom cookie), not the default", () => {
    const demoGuard: RequestAuthenticator = {
      authenticate: () => Promise.resolve(null),
      hasSession: (request) =>
        (request.headers.get("cookie") ?? "").includes("plumix_demo="),
    };
    expect(requestHasSession(demoGuard, req({ cookie: "plumix_demo=t" }))).toBe(
      true,
    );
    // The standard session cookie does NOT satisfy an authenticator that keys
    // off its own.
    expect(
      requestHasSession(demoGuard, req({ cookie: `${SESSION_COOKIE_NAME}=t` })),
    ).toBe(false);
  });

  test("falls back to the standard session cookie when an authenticator omits hasSession", () => {
    const legacyGuard: RequestAuthenticator = {
      authenticate: () => Promise.resolve(null),
    };
    expect(requestHasSession(legacyGuard, req())).toBe(false);
    expect(
      requestHasSession(
        legacyGuard,
        req({ cookie: `${SESSION_COOKIE_NAME}=t` }),
      ),
    ).toBe(true);
  });
});

describe("authenticateSession", () => {
  async function resolveWith(result: (user: User) => AuthResult | null) {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const ctx = createTestContext({
      db,
      request: new Request("https://cms.example/admin"),
      authenticator: { authenticate: () => Promise.resolve(result(user)) },
    });
    return { user, resolved: await authenticateSession(ctx) };
  }

  test("returns a session caller as resolved", async () => {
    const { user, resolved } = await resolveWith((u) => ({
      user: u,
      credential: "session",
    }));
    expect(resolved?.user.id).toBe(user.id);
  });

  test("treats an api-token caller as anonymous", async () => {
    const { resolved } = await resolveWith((u) => ({
      user: u,
      credential: "api-token",
      tokenScopes: null,
    }));
    expect(resolved).toBeNull();
  });

  test("treats a result that names no credential kind as anonymous", async () => {
    // An untyped JS authenticator that omits `credential`.
    const { resolved } = await resolveWith(
      (u) => ({ user: u }) as unknown as AuthResult,
    );
    expect(resolved).toBeNull();
  });

  test("returns null when the authenticator resolves no one", async () => {
    const { resolved } = await resolveWith(() => null);
    expect(resolved).toBeNull();
  });
});

describe("tokenScopesOf", () => {
  const user = { id: 1 } as User;

  test("a session is unrestricted", () => {
    expect(tokenScopesOf({ user, credential: "session" })).toBeNull();
  });

  test("an api token carries its scopes", () => {
    expect(
      tokenScopesOf({
        user,
        credential: "api-token",
        tokenScopes: ["entry:post:read"],
      }),
    ).toEqual(["entry:post:read"]);
  });

  test("an unscoped api token is unrestricted", () => {
    expect(
      tokenScopesOf({ user, credential: "api-token", tokenScopes: null }),
    ).toBeNull();
  });
});
