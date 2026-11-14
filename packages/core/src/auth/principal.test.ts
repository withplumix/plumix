import { describe, expect, test, vi } from "vitest";

import type {
  AppContext,
  AuthenticatedUser,
  Credential,
} from "../context/app-context.js";
import type { AuthResult, RequestAuthenticator } from "./authenticator.js";
import { eq } from "../db/index.js";
import { apiTokens } from "../db/schema/api_tokens.js";
import { createTestContext } from "../test/context.js";
import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { resolvePrincipal } from "./principal.js";
import { withUser } from "./with-user.js";

const editor: AuthenticatedUser = {
  id: 7,
  email: "editor@example.com",
  role: "editor",
  meta: {},
};

const TOKEN: Credential = {
  kind: "api-token",
  token: { id: "token-hash", name: "ci" },
  scopes: ["entry:post:read"],
};

const asSession = (user: AuthenticatedUser): AuthResult =>
  ({ user, credential: "session" }) as unknown as AuthResult;

const asToken = (user: AuthenticatedUser): AuthResult =>
  ({
    user,
    credential: "api-token",
    tokenScopes: ["entry:post:read"],
    apiToken: { id: "token-hash", name: "ci" },
  }) as unknown as AuthResult;

async function contextWith(
  authenticator: RequestAuthenticator,
  request = new Request("https://cms.example/"),
): Promise<AppContext> {
  return createTestContext({
    db: await createTestDb(),
    request,
    authenticator,
  });
}

const withCookie = (cookie: string) =>
  new Request("https://cms.example/", { headers: { cookie } });

describe("the configured policy", () => {
  test("carries a session's credential", async () => {
    const ctx = await contextWith({
      authenticate: () => Promise.resolve(asSession(editor)),
    });

    const authed = await resolvePrincipal(ctx, { kind: "configured" });

    expect(authed?.user).toEqual(editor);
    expect(authed?.credential).toEqual({ kind: "session" });
  });

  test("carries an API token's credential, scopes included", async () => {
    const ctx = await contextWith({
      authenticate: () => Promise.resolve(asToken(editor)),
    });

    const authed = await resolvePrincipal(ctx, { kind: "configured" });

    expect(authed?.credential).toEqual(TOKEN);
    expect(authed?.tokenScopes).toEqual(["entry:post:read"]);
    expect(authed?.apiToken).toEqual({ id: "token-hash", name: "ci" });
  });

  test("never resolves a context that already carries a principal", async () => {
    const authenticate = vi.fn(() => Promise.resolve(null));
    const ctx = withUser(await contextWith({ authenticate }), editor, TOKEN);

    const authed = await resolvePrincipal(ctx, { kind: "configured" });

    expect(authenticate).not.toHaveBeenCalled();
    expect(authed?.user).toEqual(editor);
    expect(authed?.credential).toEqual(TOKEN);
  });

  test("resolves no one from a result that names no credential kind", async () => {
    // An untyped JS authenticator that omits `credential`.
    const ctx = await contextWith({
      authenticate: () =>
        Promise.resolve({ user: editor } as unknown as AuthResult),
    });

    expect(await resolvePrincipal(ctx, { kind: "configured" })).toBeNull();
  });

  test("resolves no one when the authenticator does", async () => {
    const ctx = await contextWith({
      authenticate: () => Promise.resolve(null),
    });

    expect(await resolvePrincipal(ctx, { kind: "configured" })).toBeNull();
  });
});

describe("the session policy", () => {
  test("admits a session", async () => {
    const ctx = await contextWith({
      authenticate: () => Promise.resolve(asSession(editor)),
    });

    const authed = await resolvePrincipal(ctx, { kind: "session" });

    expect(authed?.credential).toEqual({ kind: "session" });
  });

  test("admits a context already resolved from a session", async () => {
    const ctx = withUser(
      await contextWith({ authenticate: () => Promise.resolve(null) }),
      editor,
      { kind: "session" },
    );

    const authed = await resolvePrincipal(ctx, { kind: "session" });

    expect(authed?.user).toEqual(editor);
  });

  test("refuses an API token", async () => {
    const ctx = await contextWith({
      authenticate: () => Promise.resolve(asToken(editor)),
    });

    expect(await resolvePrincipal(ctx, { kind: "session" })).toBeNull();
  });

  test("refuses a context already resolved from an API token", async () => {
    const ctx = withUser(
      await contextWith({
        authenticate: () => Promise.resolve(asSession(editor)),
      }),
      editor,
      TOKEN,
    );

    expect(await resolvePrincipal(ctx, { kind: "session" })).toBeNull();
  });
});

describe("the bearer policy", () => {
  async function siteWithToken(audience: string | null) {
    const db = await createTestDb();
    const factory = factoriesFor(db);
    const user = await factory.user.create({ role: "editor" });
    const { secret } = await factory.apiToken.create({
      userId: user.id,
      audience,
    });
    const ctx = createTestContext({
      db,
      request: new Request("https://cms.example/", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    });
    return { ctx, user };
  }

  test("admits an unbound API token on a surface that names no audience", async () => {
    const { ctx, user } = await siteWithToken(null);

    const authed = await resolvePrincipal(ctx, {
      kind: "bearer",
      audience: null,
    });

    expect(authed?.user.id).toBe(user.id);
    expect(authed?.credential?.kind).toBe("api-token");
  });

  test("admits a token bound to the audience the surface names", async () => {
    const { ctx, user } = await siteWithToken(
      "https://cms.example/_plumix/mcp",
    );

    const authed = await resolvePrincipal(ctx, {
      kind: "bearer",
      audience: "https://cms.example/_plumix/mcp",
    });

    expect(authed?.user.id).toBe(user.id);
  });

  test("refuses a bound token on a surface that names no audience", async () => {
    const { ctx } = await siteWithToken("https://cms.example/_plumix/mcp");

    expect(
      await resolvePrincipal(ctx, { kind: "bearer", audience: null }),
    ).toBeNull();
  });

  test("never reads a session", async () => {
    const authenticate = vi.fn(() => Promise.resolve(asSession(editor)));
    const ctx = await contextWith(
      { authenticate },
      withCookie("plumix_session=t"),
    );

    expect(
      await resolvePrincipal(ctx, { kind: "bearer", audience: null }),
    ).toBeNull();
    expect(authenticate).not.toHaveBeenCalled();
  });

  test("refuses a context already resolved from a session", async () => {
    const ctx = withUser(
      await contextWith({ authenticate: () => Promise.resolve(null) }),
      editor,
      { kind: "session" },
    );

    expect(
      await resolvePrincipal(ctx, { kind: "bearer", audience: null }),
    ).toBeNull();
  });
});

describe("the session-gated policy", () => {
  test("asks no authenticator when the request has no session", async () => {
    const authenticate = vi.fn();
    const ctx = await contextWith({ authenticate });

    expect(await resolvePrincipal(ctx, { kind: "session-gated" })).toBeNull();
    expect(authenticate).not.toHaveBeenCalled();
  });

  test("never reads a bearer token", async () => {
    const db = await createTestDb();
    const factory = factoriesFor(db);
    const user = await factory.user.create({ role: "editor" });
    const { secret, row: token } = await factory.apiToken.create({
      userId: user.id,
    });
    const ctx = createTestContext({
      db,
      request: new Request("https://cms.example/", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    });

    const authed = await resolvePrincipal(ctx, { kind: "session-gated" });

    expect(authed).toBeNull();
    const [row] = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, token.id));
    expect(row?.lastUsedAt).toBeNull();
  });

  test("resolves a session the request carries", async () => {
    const authenticate = vi.fn(() => Promise.resolve(asSession(editor)));
    const ctx = await contextWith(
      { authenticate },
      withCookie("plumix_session=abc"),
    );

    const authed = await resolvePrincipal(ctx, { kind: "session-gated" });

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(authed?.user).toEqual(editor);
  });

  test("resolves no one when the authenticator refuses the session", async () => {
    const ctx = await contextWith(
      { authenticate: () => Promise.resolve(null) },
      withCookie("plumix_session=stale"),
    );

    expect(await resolvePrincipal(ctx, { kind: "session-gated" })).toBeNull();
  });

  // Keying off `plumix_session` rendered such visitors anonymous.
  test("asks a custom authenticator that carries its session another way", async () => {
    const ctx = await contextWith(
      {
        authenticate: () => Promise.resolve(asSession(editor)),
        hasSession: (request) =>
          (request.headers.get("cookie") ?? "").includes("plumix_demo="),
      },
      withCookie("plumix_demo=session-token"),
    );

    const authed = await resolvePrincipal(ctx, { kind: "session-gated" });

    expect(authed?.user).toEqual(editor);
  });

  test("asks no custom authenticator whose hasSession is false", async () => {
    const authenticate = vi.fn();
    const ctx = await contextWith(
      { authenticate, hasSession: () => false },
      withCookie("plumix_session=abc"),
    );

    expect(await resolvePrincipal(ctx, { kind: "session-gated" })).toBeNull();
    expect(authenticate).not.toHaveBeenCalled();
  });
});

describe("the user a policy carries", () => {
  test("is the user's identity unless the surface projects another shape", async () => {
    const row = { ...editor, name: "Ed", avatarUrl: null };
    const ctx = await contextWith({
      authenticate: () => Promise.resolve(asSession(row)),
    });

    const identity = await resolvePrincipal(ctx, { kind: "configured" });
    const whole = await resolvePrincipal(
      ctx,
      { kind: "configured" },
      (user) => user,
    );

    expect(identity?.user).toEqual(editor);
    expect(whole?.user).toEqual(row);
  });
});
