import { describe, expect, test } from "vitest";

import { eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
import {
  createDispatcherHarness,
  plumixRequest,
} from "../../test/dispatcher.js";
import {
  buildAssertion,
  buildAttestation,
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
    const keyPair = generatePasskeyKeyPair();
    const credentialId = randomCredentialId();
    const att = buildAttestation({
      keyPair,
      rpId: "cms.example",
      origin: "https://cms.example",
      challenge,
      credentialId,
    });
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: att.credentialIdBase64Url,
          rawId: att.credentialIdBase64Url,
          type: "public-key",
          response: {
            clientDataJSON: att.clientDataJSON,
            attestationObject: att.attestationObject,
          },
        }),
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("challenge_not_bound_to_user");
  });
});

describe("invite register — options", () => {
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
    // Remove the user; the token row cascades away via the FK. This mirrors
    // the admin-deletes-invitee race — a prior invite URL is now invalid.
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
      authenticator: {
        authenticate: () => Promise.resolve(null),
        signOutUrl: () => "https://idp.example/logout",
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
});

// Full end-to-end happy path exercising every /_plumix/auth/* POST: bootstrap
// → register/options → register/verify → signout → login/options →
// login/verify. Driven through the dispatcher (not direct fn calls) so any
// regression in the wire-level schema, CSRF gate, or session plumbing shows
// up here instead of only at deploy time.
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
    const attestation = buildAttestation({
      keyPair,
      rpId,
      origin,
      challenge: registerChallenge,
      credentialId,
    });
    const verifyRes = await h.fetch("/_plumix/auth/passkey/register/verify", {
      json: {
        id: attestation.credentialIdBase64Url,
        rawId: attestation.credentialIdBase64Url,
        type: "public-key",
        response: {
          clientDataJSON: attestation.clientDataJSON,
          attestationObject: attestation.attestationObject,
        },
      },
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
        id: attestation.credentialIdBase64Url,
        rawId: attestation.credentialIdBase64Url,
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
