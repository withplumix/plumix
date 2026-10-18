import { describe, expect, test } from "vitest";

import type { AuthResult } from "../../context/authenticator.js";
import type { User } from "../../db/schema/users.js";
import { eq, sql } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { credentials } from "../../db/schema/credentials.js";
import { sessions } from "../../db/schema/sessions.js";
import { users } from "../../db/schema/users.js";
import { definePlugin } from "../../plugin/define.js";
import { text } from "../../plugin/fields/index.js";
import {
  createDispatcherHarness,
  plumixRequest,
} from "../../test/dispatcher.js";
import {
  buildAssertion,
  buildRegisterVerifyEnvelope,
  generatePasskeyKeyPair,
  randomCredentialId,
} from "../../test/fixtures/webauthn.js";
import { SESSION_COOKIE_NAME } from "../cookies.js";
import { generateToken, hashToken } from "../tokens.js";
import { issueChallenge } from "./challenges.js";

describe("passkey register — options", () => {
  test("bootstraps the first user and issues a challenge", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@cms.example" }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      challenge: string;
      user: { name: string };
    };
    expect(body.user.name).toBe("admin@cms.example");
    expect(typeof body.challenge).toBe("string");
  });

  // A user the passkey bootstrap provisions is a new entity, so it starts from
  // the user fields' defaults (ADR 0026).
  test("the bootstrapped user stores the user fields' defaults", async () => {
    const h = await createDispatcherHarness({
      config: {
        plugins: [
          definePlugin("profiles", (ctx) => {
            ctx.registerUserMetaBox("profile", {
              label: "Profile",
              fields: [text("pronouns").default("they/them"), text("bio")],
            });
          }),
        ],
      },
    });

    await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@cms.example" }),
      }),
    );

    const created = await h.db.query.users.findFirst({
      where: eq(users.email, "admin@cms.example"),
    });
    expect(created?.meta).toEqual({ pronouns: "they/them" });
  });

  test("is race-safe on concurrent bootstraps of the same email", async () => {
    const h = await createDispatcherHarness();
    const two = await Promise.all([
      h.dispatch(
        plumixRequest("/_plumix/auth/passkey/register/options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "same@cms.example" }),
        }),
      ),
      h.dispatch(
        plumixRequest("/_plumix/auth/passkey/register/options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "same@cms.example" }),
        }),
      ),
    ]);
    for (const response of two) expect(response.status).toBe(200);
    // The race is decided by UNIQUE(email): exactly one row must exist after
    // both options calls settle, regardless of which request won the insert.
    const rows = await h.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "same@cms.example"));
    expect(rows).toHaveLength(1);
  });

  test("rejects an invalid email with 400", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  test("rejects unauthenticated register after bootstrap (registration closed)", async () => {
    const h = await createDispatcherHarness();
    await h.seedUser("admin");

    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "stranger@example.com" }),
      }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("registration_closed");
  });

  test("authenticated caller adding another email is rejected (email_mismatch)", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("author");
    const authed = await h.authenticateRequest(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "somebody-else@example.com" }),
      }),
      user.id,
    );
    const response = await h.dispatch(authed);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("email_mismatch");
  });

  test("authenticated user may enrol an additional device (own email)", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("editor");
    const authed = await h.authenticateRequest(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      }),
      user.id,
    );
    const response = await h.dispatch(authed);
    expect(response.status).toBe(200);
  });

  test("unauthenticated options omits excludeCredentials (no user-existence oracle)", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "first@example.com" }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { excludeCredentials?: unknown };
    expect(body.excludeCredentials).toBeUndefined();
  });
});

describe("passkey register — options under a configured authenticator", () => {
  // Stands in for an SSO authenticator (cfAccess, a custom IdP) that resolves
  // the caller without minting a `plumix_session` cookie.
  function harnessResolving(result: () => AuthResult | null) {
    return createDispatcherHarness({
      config: {
        auth: {
          authenticator: { authenticate: () => Promise.resolve(result()) },
        },
      },
    });
  }

  async function harnessSignedInAs(
    credential: (user: User) => AuthResult,
  ): Promise<{ h: Awaited<ReturnType<typeof harnessResolving>>; user: User }> {
    let caller: User | null = null;
    const h = await harnessResolving(() =>
      caller ? credential(caller) : null,
    );
    caller = await h.seedUser("editor");
    return { h, user: caller };
  }

  const asSession = (user: User): AuthResult => ({
    user,
    credential: "session",
  });

  test("a session caller with no cookie enrols another passkey for their own email", async () => {
    const { h, user } = await harnessSignedInAs(asSession);

    const response = await h.fetch("/_plumix/auth/passkey/register/options", {
      json: { email: user.email },
    });

    response.assertStatus(200);
  });

  test("the add-device options exclude the caller's enrolled passkeys", async () => {
    const { h, user } = await harnessSignedInAs(asSession);
    const enrolled = await h.factory.credential.create({
      userId: user.id,
      publicKey: Buffer.from([1, 2, 3]),
    });

    const response = await h.fetch("/_plumix/auth/passkey/register/options", {
      json: { email: user.email },
    });

    response.assertStatus(200);
    const body = await response.json<{
      excludeCredentials: { id: string }[];
    }>();
    expect(body.excludeCredentials.map((c) => c.id)).toEqual([enrolled.id]);
  });

  test("a session caller asking for another email is refused with email_mismatch", async () => {
    const { h } = await harnessSignedInAs(asSession);

    const response = await h.fetch("/_plumix/auth/passkey/register/options", {
      json: { email: "somebody-else@example.com" },
    });

    response.assertStatus(403);
    expect(await response.json()).toEqual({ error: "email_mismatch" });
  });

  test("an api-token caller counts as anonymous, whatever header carried it", async () => {
    const { h, user } = await harnessSignedInAs((u) => ({
      user: u,
      credential: "api-token",
      tokenScopes: null,
    }));

    const response = await h.fetch("/_plumix/auth/passkey/register/options", {
      json: { email: user.email },
    });

    response.assertStatus(403);
    expect(await response.json()).toEqual({ error: "registration_closed" });
  });

  test("an anonymous caller is refused once a user exists", async () => {
    const h = await harnessResolving(() => null);
    await h.seedUser("admin");

    const response = await h.fetch("/_plumix/auth/passkey/register/options", {
      json: { email: "stranger@example.com" },
    });

    response.assertStatus(403);
    expect(await response.json()).toEqual({ error: "registration_closed" });
  });

  test("an anonymous caller bootstraps the first user", async () => {
    const h = await harnessResolving(() => null);

    const response = await h.fetch("/_plumix/auth/passkey/register/options", {
      json: { email: "first@example.com" },
    });

    response.assertStatus(200);
  });
});

describe("passkey register — options for an api-token caller", () => {
  test.each([
    ["a scoped token", ["entry:post:read"]],
    ["an unscoped token", null],
  ])(
    "%s is refused with registration_closed",
    async (_label, scopes: string[] | null) => {
      const h = await createDispatcherHarness();
      const user = await h.seedUser("admin");
      const { secret } = await h.factory.apiToken.create({
        userId: user.id,
        scopes,
      });

      const response = await h.fetch("/_plumix/auth/passkey/register/options", {
        json: { email: user.email },
        headers: { authorization: `Bearer ${secret}` },
      });

      response.assertStatus(403);
      expect(await response.json()).toEqual({ error: "registration_closed" });
    },
  );

  test("a token sent with a junk session cookie is refused with registration_closed", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("admin");
    const { secret } = await h.factory.apiToken.create({ userId: user.id });

    const response = await h.fetch("/_plumix/auth/passkey/register/options", {
      json: { email: user.email },
      headers: {
        authorization: `Bearer ${secret}`,
        cookie: `${SESSION_COOKIE_NAME}=not-a-real-session`,
      },
    });

    response.assertStatus(403);
    expect(await response.json()).toEqual({ error: "registration_closed" });
  });
});

describe("passkey verify — input validation", () => {
  test("register/verify with malformed body returns 400 (not 500)", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "x", type: "not-a-key" }),
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_input");
  });

  test("login/verify with wildly oversized payload fails schema, not oslo", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/login/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "a".repeat(2048),
          rawId: "a",
          type: "public-key",
          response: {
            clientDataJSON: "a",
            authenticatorData: "a",
            signature: "a",
          },
        }),
      }),
    );
    expect(response.status).toBe(400);
  });

  test("register/verify returns challenge_not_bound_to_user when the challenge had no userId", async () => {
    // The options route always binds a userId; bypass it by issuing a raw
    // challenge directly so the userId === null branch is reachable.
    const h = await createDispatcherHarness();
    const { challenge } = await issueChallenge(h.db, 60_000);
    const envelope = buildRegisterVerifyEnvelope({
      keyPair: generatePasskeyKeyPair(),
      rpId: "cms.example",
      origin: "https://cms.example",
      challenge,
      credentialId: randomCredentialId(),
    });
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(envelope),
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("challenge_not_bound_to_user");
  });
});

async function seedInvite(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  opts: {
    readonly role?: "author" | "editor" | "admin";
    readonly expiresInMs?: number;
  } = {},
) {
  const user = await h.seedUser(opts.role ?? "author");
  const token = generateToken();
  const tokenHash = await hashToken(token);
  await h.factory.invite.create({
    hash: tokenHash,
    userId: user.id,
    email: user.email,
    role: opts.role ?? "author",
    expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 60_000)),
  });
  return { user, token, tokenHash };
}

describe("invite register — options", () => {
  test("returns registration options + invitee metadata for a valid token", async () => {
    const h = await createDispatcherHarness();
    const { user, token } = await seedInvite(h, { role: "editor" });

    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/invite/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      options: { challenge: string };
      invitee: { email: string; role: string };
    };
    expect(typeof body.options.challenge).toBe("string");
    expect(body.invitee.email).toBe(user.email);
    expect(body.invitee.role).toBe("editor");
  });

  test("does NOT consume the token on options (allows retry after user abandons)", async () => {
    const h = await createDispatcherHarness();
    const { token, tokenHash } = await seedInvite(h);

    await h.dispatch(
      plumixRequest("/_plumix/auth/invite/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );

    const row = await h.db.query.authTokens.findFirst({
      where: eq(authTokens.hash, tokenHash),
    });
    expect(row).toBeDefined();
  });

  test("404 for an unknown token", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/invite/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: generateToken() }),
      }),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_token");
  });

  test("410 for an expired token", async () => {
    const h = await createDispatcherHarness();
    const { token } = await seedInvite(h, { expiresInMs: -60_000 });
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/invite/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    expect(response.status).toBe(410);
  });

  test("409 when the invited user already has credentials", async () => {
    const h = await createDispatcherHarness();
    const { user, token } = await seedInvite(h);
    // Seed a credential as if the user had already registered.
    await h.factory.credential.create({
      userId: user.id,
      publicKey: Buffer.from([1, 2, 3]),
    });

    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/invite/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("already_registered");
  });

  test("404 when the invited user was deleted after the invite", async () => {
    const h = await createDispatcherHarness();
    const { user, token } = await seedInvite(h);
    // Remove the user; the token row cascades away via the FK. This is the
    // admin-deletes-invitee race — a prior invite URL is now invalid.
    const { users } = await import("../../db/schema/users.js");
    await h.db.delete(users).where(eq(users.id, user.id));

    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/invite/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    expect(response.status).toBe(404);
  });

  test("404 when the invited user is disabled", async () => {
    const h = await createDispatcherHarness();
    const { user, token } = await seedInvite(h);
    const { users } = await import("../../db/schema/users.js");
    await h.db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, user.id));

    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/invite/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    expect(response.status).toBe(404);
  });

  test("rejects malformed input (missing token) with 400", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/invite/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe("invite register — verify", () => {
  test("404 for an unknown token before touching WebAuthn logic", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/invite/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: generateToken(),
          response: {
            id: "a",
            rawId: "a",
            type: "public-key",
            response: { clientDataJSON: "a", attestationObject: "a" },
          },
        }),
      }),
    );
    expect(response.status).toBe(404);
  });

  test("410 for an expired token (checked again at verify, not just options)", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("editor");
    const token = generateToken();
    const tokenHash = await hashToken(token);
    await h.factory.invite.create({
      hash: tokenHash,
      userId: user.id,
      email: user.email,
      role: "editor",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/invite/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          response: {
            id: "a",
            rawId: "a",
            type: "public-key",
            response: { clientDataJSON: "a", attestationObject: "a" },
          },
        }),
      }),
    );
    expect(response.status).toBe(410);
  });

  test("rejects malformed input (missing response) with 400", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/invite/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: generateToken() }),
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe("register verify — ceremony binding", () => {
  function attestationResponse(challenge: string) {
    return buildRegisterVerifyEnvelope({
      keyPair: generatePasskeyKeyPair(),
      rpId: "cms.example",
      origin: "https://cms.example",
      challenge,
      credentialId: randomCredentialId(),
    });
  }

  test("passkey register verify refuses an invite challenge without enrolling the invitee", async () => {
    const h = await createDispatcherHarness();
    await h.seedUser("admin");
    const { user, token, tokenHash } = await seedInvite(h);

    const optionsRes = await h.fetch("/_plumix/auth/invite/register/options", {
      json: { token },
    });
    optionsRes.assertStatus(200);
    const { options } = await optionsRes.json<{
      options: { challenge: string };
    }>();

    const verifyRes = await h.fetch("/_plumix/auth/passkey/register/verify", {
      json: attestationResponse(options.challenge),
    });
    verifyRes.assertStatus(400);
    expect(await verifyRes.json<{ error: string }>()).toEqual({
      error: "challenge_mismatch",
    });
    expect(verifyRes.headers.get("set-cookie")).toBeNull();

    const creds = await h.db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, user.id));
    expect(creds).toHaveLength(0);
    const invite = await h.db
      .select()
      .from(authTokens)
      .where(eq(authTokens.hash, tokenHash));
    expect(invite).toHaveLength(1);
  });

  test("invite register verify refuses a passkey add-device challenge without consuming the invite", async () => {
    const h = await createDispatcherHarness();
    await h.seedUser("admin");
    const { user, token, tokenHash } = await seedInvite(h);

    const optionsRes = await h.fetch("/_plumix/auth/passkey/register/options", {
      json: { email: user.email },
      as: user,
    });
    optionsRes.assertStatus(200);
    const { challenge } = await optionsRes.json<{ challenge: string }>();

    const verifyRes = await h.fetch("/_plumix/auth/invite/register/verify", {
      json: { token, response: attestationResponse(challenge) },
    });
    verifyRes.assertStatus(400);
    expect(await verifyRes.json<{ error: string }>()).toEqual({
      error: "challenge_mismatch",
    });
    expect(verifyRes.headers.get("set-cookie")).toBeNull();

    const creds = await h.db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, user.id));
    expect(creds).toHaveLength(0);
    const invite = await h.db
      .select()
      .from(authTokens)
      .where(eq(authTokens.hash, tokenHash));
    expect(invite).toHaveLength(1);
  });

  test("a refused challenge is consumed: replaying it to the invite route fails challenge_not_found", async () => {
    const h = await createDispatcherHarness();
    await h.seedUser("admin");
    const { token } = await seedInvite(h);

    const optionsRes = await h.fetch("/_plumix/auth/invite/register/options", {
      json: { token },
    });
    const { options } = await optionsRes.json<{
      options: { challenge: string };
    }>();
    const response = attestationResponse(options.challenge);

    const wrongRoute = await h.fetch("/_plumix/auth/passkey/register/verify", {
      json: response,
    });
    wrongRoute.assertStatus(400);
    expect((await wrongRoute.json<{ error: string }>()).error).toBe(
      "challenge_mismatch",
    );

    const rightRoute = await h.fetch("/_plumix/auth/invite/register/verify", {
      json: { token, response },
    });
    rightRoute.assertStatus(400);
    expect((await rightRoute.json<{ error: string }>()).error).toBe(
      "challenge_not_found",
    );
  });
});

describe("passkey signout", () => {
  test("clears the cookie even when no session exists", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  test("under a basePath the cookie is cleared from the base-scoped path", async () => {
    const h = await createDispatcherHarness({
      config: { basePath: "/custom-directory" },
    });
    const response = await h.dispatch(
      plumixRequest("/custom-directory/_plumix/auth/signout", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "Path=/custom-directory",
    );
  });

  test("invalidates an existing session", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("admin");
    const authed = await h.authenticateRequest(
      plumixRequest("/_plumix/auth/signout", { method: "POST" }),
      user.id,
    );
    const response = await h.dispatch(authed);
    expect(response.status).toBe(200);
  });

  test("redirectTo is null without an external authenticator", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", { method: "POST" }),
    );
    const body = (await response.json()) as { redirectTo: string | null };
    expect(body.redirectTo).toBeNull();
  });

  test("surfaces signOutUrl from a custom authenticator", async () => {
    const h = await createDispatcherHarness({
      config: {
        auth: {
          authenticator: {
            authenticate: () => Promise.resolve(null),
            signOutUrl: () => "https://idp.example/logout",
          },
        },
      },
    });
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { redirectTo: string | null };
    expect(body.redirectTo).toBe("https://idp.example/logout");
    // Local cookie still cleared even when an external IdP owns the
    // session — defence in depth, in case the operator switched
    // authenticators while sessions were live.
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("Max-Age=0");
  });

  test("passes the sign-out request to signOutUrl", async () => {
    const h = await createDispatcherHarness({
      config: {
        auth: {
          authenticator: {
            authenticate: () => Promise.resolve(null),
            signOutUrl: (request) =>
              request.headers.has("x-idp-session")
                ? "https://idp.example/logout"
                : null,
          },
        },
      },
    });
    const withIdp = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", {
        method: "POST",
        headers: { "x-idp-session": "1" },
      }),
    );
    const withoutIdp = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", { method: "POST" }),
    );
    const withBody = (await withIdp.json()) as { redirectTo: string | null };
    const withoutBody = (await withoutIdp.json()) as {
      redirectTo: string | null;
    };
    expect(withBody.redirectTo).toBe("https://idp.example/logout");
    expect(withoutBody.redirectTo).toBeNull();
  });

  test.each([
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>"],
    ["protocol-relative", "//attacker.example/logout"],
    ["plain http", "http://insecure.example/logout"],
    ["relative path", "logout"],
    ["CR injection", "https://idp.example/logout\r\nset-cookie: x=y"],
    ["empty string", ""],
  ])(
    "drops unsafe signOutUrl values (%s) and surfaces null instead",
    async (_name, badUrl) => {
      const h = await createDispatcherHarness({
        config: {
          auth: {
            authenticator: {
              authenticate: () => Promise.resolve(null),
              signOutUrl: () => badUrl,
            },
          },
        },
      });
      const response = await h.dispatch(
        plumixRequest("/_plumix/auth/signout", { method: "POST" }),
      );
      const body = (await response.json()) as { redirectTo: string | null };
      expect(body.redirectTo).toBeNull();
    },
  );

  test("accepts a same-origin path as signOutUrl", async () => {
    const h = await createDispatcherHarness({
      config: {
        auth: {
          authenticator: {
            authenticate: () => Promise.resolve(null),
            signOutUrl: () => "/_plumix/admin/login",
          },
        },
      },
    });
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", { method: "POST" }),
    );
    const body = (await response.json()) as { redirectTo: string | null };
    expect(body.redirectTo).toBe("/_plumix/admin/login");
  });
});

function signOutFormPost(query = "", origin = "https://cms.example"): Request {
  return new Request(`https://cms.example/_plumix/auth/signout${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
  });
}

describe("sign-out by form post and redirectTo", () => {
  test("a same-site form post clears the session and lands on ?signed_out=1", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("admin");
    const signedIn = await h.authenticateRequest(signOutFormPost(), user.id);
    const signedOut = h.spyAction("user:signed_out");

    const response = await h.dispatch(signedIn);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?signed_out=1",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await h.db.$count(sessions)).toBe(0);
    signedOut.assertCalledOnce();
  });

  test("a form post with ?redirectTo=/account lands on /account", async () => {
    const h = await createDispatcherHarness();

    const response = await h.dispatch(
      signOutFormPost("?redirectTo=%2Faccount"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/account");
  });

  test("a form post under an authenticator with a signOutUrl lands on it", async () => {
    const h = await createDispatcherHarness({
      config: {
        auth: {
          authenticator: {
            authenticate: () => Promise.resolve(null),
            signOutUrl: () => "https://idp.example/logout",
          },
        },
      },
    });

    const response = await h.dispatch(
      signOutFormPost("?redirectTo=%2Faccount"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://idp.example/logout");
  });

  test("a cross-origin form post is refused as csrf_origin_mismatch", async () => {
    const h = await createDispatcherHarness();

    const response = await h.dispatch(
      signOutFormPost("", "https://evil.example"),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "forbidden",
      reason: "csrf_origin_mismatch",
    });
  });

  test.each([
    ["/account", "/account"],
    ["https://evil.example/", "/"],
    ["//evil.example", "/"],
    ["/../x", "/"],
  ])("a fetch's ?redirectTo=%s answers %s", async (value, expected) => {
    const h = await createDispatcherHarness();

    const response = await h.dispatch(
      plumixRequest(
        `/_plumix/auth/signout?${new URLSearchParams({ redirectTo: value }).toString()}`,
        { method: "POST" },
      ),
    );

    expect(await response.json()).toEqual({ ok: true, redirectTo: expected });
  });

  test("under base path /blog a fetch's ?redirectTo=/other answers /blog/", async () => {
    const h = await createDispatcherHarness({ config: { basePath: "/blog" } });

    const response = await h.dispatch(
      plumixRequest("/blog/_plumix/auth/signout?redirectTo=%2Fother", {
        method: "POST",
      }),
    );

    expect(await response.json()).toEqual({ ok: true, redirectTo: "/blog/" });
  });

  test("a signOutUrl wins over ?redirectTo= for a fetch", async () => {
    const h = await createDispatcherHarness({
      config: {
        auth: {
          authenticator: {
            authenticate: () => Promise.resolve(null),
            signOutUrl: () => "https://idp.example/logout",
          },
        },
      },
    });

    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/signout?redirectTo=%2Faccount", {
        method: "POST",
      }),
    );

    expect(await response.json()).toEqual({
      ok: true,
      redirectTo: "https://idp.example/logout",
    });
  });
});

// Driven through the dispatcher so a regression in the wire schema, CSRF gate
// or session plumbing shows up here rather than at deploy time.
describe("passkey end-to-end happy path", () => {
  test("register a new user, signout, then login with the same credential", async () => {
    const h = await createDispatcherHarness();
    const keyPair = generatePasskeyKeyPair();
    const credentialId = randomCredentialId();
    const email = "e2e@cms.example";
    const rpId = "cms.example";
    const origin = "https://cms.example";

    // 1. register/options — bootstrap first user + obtain challenge
    const optionsRes = await h.fetch("/_plumix/auth/passkey/register/options", {
      json: { email },
    });
    optionsRes.assertStatus(200);
    const { challenge: registerChallenge } = await optionsRes.json<{
      challenge: string;
    }>();

    // 2. register/verify — complete ceremony with the fixture key pair
    const envelope = buildRegisterVerifyEnvelope({
      keyPair,
      rpId,
      origin,
      challenge: registerChallenge,
      credentialId,
    });
    const verifyRes = await h.fetch("/_plumix/auth/passkey/register/verify", {
      json: envelope,
    });
    verifyRes.assertStatus(200).assertCookieSet(SESSION_COOKIE_NAME);

    // 3. signout — clear the session we just created
    const verifyCookie = verifyRes.headers.get("set-cookie") ?? "";
    const signoutRes = await h.fetch("/_plumix/auth/signout", {
      method: "POST",
      headers: { cookie: verifyCookie },
    });
    signoutRes.assertStatus(200);

    // 4. login/options — new authentication challenge
    const loginOptionsRes = await h.fetch(
      "/_plumix/auth/passkey/login/options",
      { json: { email } },
    );
    loginOptionsRes.assertStatus(200);
    const { challenge: loginChallenge } = await loginOptionsRes.json<{
      challenge: string;
    }>();

    // 5. login/verify — sign the challenge with the registered key
    const assertion = buildAssertion({
      keyPair,
      rpId,
      origin,
      challenge: loginChallenge,
      counter: 1,
    });
    const loginVerifyRes = await h.fetch("/_plumix/auth/passkey/login/verify", {
      json: {
        id: envelope.id,
        rawId: envelope.id,
        type: "public-key",
        response: {
          clientDataJSON: assertion.clientDataJSON,
          authenticatorData: assertion.authenticatorData,
          signature: assertion.signature,
        },
      },
    });
    loginVerifyRes.assertStatus(200).assertCookieSet(SESSION_COOKIE_NAME);
  });
});

type Harness = Awaited<ReturnType<typeof createDispatcherHarness>>;

/** Bootstraps a user with a passkey and hands back what signs in with it. */
async function enrolledPasskey(h: Harness, email: string) {
  const keyPair = generatePasskeyKeyPair();
  const options = await h.fetch("/_plumix/auth/passkey/register/options", {
    json: { email },
  });
  const { challenge } = await options.json<{ challenge: string }>();
  const envelope = buildRegisterVerifyEnvelope({
    keyPair,
    rpId: "cms.example",
    origin: "https://cms.example",
    challenge,
    credentialId: randomCredentialId(),
  });
  const registered = await h.fetch("/_plumix/auth/passkey/register/verify", {
    json: envelope,
  });
  return { keyPair, envelope, registered };
}

async function loginVerify(
  h: Harness,
  enrolled: Awaited<ReturnType<typeof enrolledPasskey>>,
  query = "",
) {
  const options = await h.fetch("/_plumix/auth/passkey/login/options", {
    json: {},
  });
  const { challenge } = await options.json<{ challenge: string }>();
  const assertion = buildAssertion({
    keyPair: enrolled.keyPair,
    rpId: "cms.example",
    origin: "https://cms.example",
    challenge,
    counter: 1,
  });
  return h.fetch(`/_plumix/auth/passkey/login/verify${query}`, {
    json: {
      id: enrolled.envelope.id,
      rawId: enrolled.envelope.id,
      type: "public-key",
      response: {
        clientDataJSON: assertion.clientDataJSON,
        authenticatorData: assertion.authenticatorData,
        signature: assertion.signature,
      },
    },
  });
}

describe("passkey verify answers", () => {
  test("register verify answers the user and the admin to go to", async () => {
    const h = await createDispatcherHarness();

    const { registered } = await enrolledPasskey(h, "admin@cms.example");

    const user = await h.db.query.users.findFirst({
      where: eq(users.email, "admin@cms.example"),
    });
    expect(await registered.json()).toEqual({
      userId: user?.id,
      redirectTo: "/_plumix/admin",
    });
  });

  test("register verify fires credential:created for the new passkey", async () => {
    const h = await createDispatcherHarness();
    const created = h.spyAction("credential:created");

    await enrolledPasskey(h, "admin@cms.example");

    const user = await h.db.query.users.findFirst({
      where: eq(users.email, "admin@cms.example"),
    });
    created.assertCalledOnce();
    expect(created.lastArgs?.[0]).toMatchObject({ userId: user?.id });
  });

  test("login verify answers the user and the admin to go to", async () => {
    const h = await createDispatcherHarness();
    const enrolled = await enrolledPasskey(h, "admin@cms.example");

    const response = await loginVerify(h, enrolled);

    const user = await h.db.query.users.findFirst({
      where: eq(users.email, "admin@cms.example"),
    });
    expect(await response.json()).toEqual({
      userId: user?.id,
      redirectTo: "/_plumix/admin",
    });
  });

  test.each([
    ["https://evil.example/", "/"],
    ["//evil.example", "/"],
    ["/../x", "/"],
    ["/account", "/account"],
  ])("login verify's ?redirectTo=%s answers %s", async (value, expected) => {
    const h = await createDispatcherHarness();
    const enrolled = await enrolledPasskey(h, "admin@cms.example");

    const response = await loginVerify(
      h,
      enrolled,
      `?${new URLSearchParams({ redirectTo: value }).toString()}`,
    );

    expect(await response.json()).toMatchObject({ redirectTo: expected });
  });

  test("login for a disabled account is refused with 403 account_disabled", async () => {
    const h = await createDispatcherHarness();
    const enrolled = await enrolledPasskey(h, "admin@cms.example");
    await h.db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.email, "admin@cms.example"));

    const response = await loginVerify(h, enrolled);

    response.assertStatus(403);
    expect(await response.json()).toEqual({ error: "account_disabled" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("login whose user row is gone is refused with 403 link_broken", async () => {
    const h = await createDispatcherHarness();
    const enrolled = await enrolledPasskey(h, "admin@cms.example");
    await h.db.run(sql`PRAGMA foreign_keys = OFF`);
    await h.db.delete(users).where(eq(users.email, "admin@cms.example"));
    await h.db.run(sql`PRAGMA foreign_keys = ON`);

    const response = await loginVerify(h, enrolled);

    response.assertStatus(403);
    expect(await response.json()).toEqual({ error: "link_broken" });
  });

  test("invite verify fires user:registered and credential:created for the invitee", async () => {
    const h = await createDispatcherHarness();
    const invitee = await h.seedUser("author");
    const token = generateToken();
    await h.factory.invite.create({
      hash: await hashToken(token),
      userId: invitee.id,
      email: invitee.email,
      role: "author",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const optionsRes = await h.fetch("/_plumix/auth/invite/register/options", {
      json: { token },
    });
    const { options } = await optionsRes.json<{
      options: { challenge: string };
    }>();
    const registered = h.spyAction("user:registered");
    const created = h.spyAction("credential:created");

    await h.fetch("/_plumix/auth/invite/register/verify", {
      json: {
        token,
        response: buildRegisterVerifyEnvelope({
          keyPair: generatePasskeyKeyPair(),
          rpId: "cms.example",
          origin: "https://cms.example",
          challenge: options.challenge,
          credentialId: randomCredentialId(),
        }),
      },
    });

    registered.assertCalledOnce();
    expect(registered.lastArgs?.[0]).toMatchObject({ id: invitee.id });
    created.assertCalledOnce();
    expect(created.lastArgs?.[0]).toMatchObject({ userId: invitee.id });
  });

  test("invite verify answers the user and the admin to go to", async () => {
    const h = await createDispatcherHarness();
    const invitee = await h.seedUser("author");
    const token = generateToken();
    await h.factory.invite.create({
      hash: await hashToken(token),
      userId: invitee.id,
      email: invitee.email,
      role: "author",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const optionsRes = await h.fetch("/_plumix/auth/invite/register/options", {
      json: { token },
    });
    const { options } = await optionsRes.json<{
      options: { challenge: string };
    }>();

    const response = await h.fetch("/_plumix/auth/invite/register/verify", {
      json: {
        token,
        response: buildRegisterVerifyEnvelope({
          keyPair: generatePasskeyKeyPair(),
          rpId: "cms.example",
          origin: "https://cms.example",
          challenge: options.challenge,
          credentialId: randomCredentialId(),
        }),
      },
    });

    expect(await response.json()).toEqual({
      userId: invitee.id,
      redirectTo: "/_plumix/admin",
    });
  });
});
