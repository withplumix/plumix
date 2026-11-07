import { describe, expect, test } from "vitest";

import { generateToken, hashToken } from "../../src/auth/tokens.js";
import { eq } from "../../src/db/index.js";
import { authTokens } from "../../src/db/schema/auth_tokens.js";
import { credentials } from "../../src/db/schema/credentials.js";
import { users } from "../../src/db/schema/users.js";
import { auth } from "../../src/events-and-filters/auth.js";
import { testSite } from "../../src/test/site.js";
import { attestationFor, challengeOf, postJson } from "../support/passkey.js";

const site = await testSite({ plugins: [] });

/** An invite for a new user of `role`, minted the way an admin's invite is. */
async function invited(
  options: {
    readonly role?: "author" | "editor" | "admin";
    readonly expiresInMs?: number;
  } = {},
) {
  const role = options.role ?? "author";
  const user = await site.factory.user.create({ role });
  const token = generateToken();
  const tokenHash = await hashToken(token);
  await site.factory.invite.create({
    hash: tokenHash,
    userId: user.id,
    email: user.email,
    role,
    expiresAt: new Date(Date.now() + (options.expiresInMs ?? 60_000)),
  });
  return { user, token, tokenHash };
}

/** A response no WebAuthn parser could accept, for routes refusing earlier. */
const junkAttestation = {
  id: "a",
  rawId: "a",
  type: "public-key",
  response: { clientDataJSON: "a", attestationObject: "a" },
};

async function inviteChallenge(token: string): Promise<string> {
  const page = await postJson(site, "/_plumix/auth/invite/register/options", {
    token,
  });
  const { options } = JSON.parse(page.body) as {
    options: { challenge: string };
  };
  return options.challenge;
}

describe("asking for invite registration options", () => {
  test("answers registration options and who the invitee is", async () => {
    const { user, token } = await invited({ role: "editor" });

    const page = await postJson(site, "/_plumix/auth/invite/register/options", {
      token,
    });

    expect(page.status).toBe(200);
    expect(JSON.parse(page.body)).toMatchObject({
      options: { challenge: expect.any(String) as unknown },
      invitee: { email: user.email, role: "editor" },
    });
  });

  test("keeps the invite, so an abandoned ceremony can be retried", async () => {
    const { token, tokenHash } = await invited();

    await postJson(site, "/_plumix/auth/invite/register/options", { token });

    const row = await site.context.db.query.authTokens.findFirst({
      where: eq(authTokens.hash, tokenHash),
    });
    expect(row).toBeDefined();
  });

  test("answers 404 invalid_token for an unknown token", async () => {
    const page = await postJson(site, "/_plumix/auth/invite/register/options", {
      token: generateToken(),
    });

    page.assertNotFound().assertJson({ error: "invalid_token" });
  });

  test("answers 410 for an expired invite", async () => {
    const { token } = await invited({ expiresInMs: -60_000 });

    const page = await postJson(site, "/_plumix/auth/invite/register/options", {
      token,
    });

    expect(page.status).toBe(410);
  });

  test("answers 409 already_registered when the invitee has a passkey", async () => {
    const { user, token } = await invited();
    await site.factory.credential.create({
      userId: user.id,
      publicKey: Buffer.from([1, 2, 3]),
    });

    const page = await postJson(site, "/_plumix/auth/invite/register/options", {
      token,
    });

    expect(page.status).toBe(409);
    page.assertJson({ error: "already_registered" });
  });

  test("answers 404 when the invitee was deleted after the invite", async () => {
    const { user, token } = await invited();
    // The token row cascades away via the FK: the admin-deletes-invitee race
    // leaves a prior invite URL invalid.
    await site.context.db.delete(users).where(eq(users.id, user.id));

    const page = await postJson(site, "/_plumix/auth/invite/register/options", {
      token,
    });

    page.assertNotFound();
  });

  test("answers 404 when the invitee is disabled", async () => {
    const { user, token } = await invited();
    await site.context.db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, user.id));

    const page = await postJson(site, "/_plumix/auth/invite/register/options", {
      token,
    });

    page.assertNotFound();
  });

  test("refuses a body with no token with 400", async () => {
    const page = await postJson(
      site,
      "/_plumix/auth/invite/register/options",
      {},
    );

    expect(page.status).toBe(400);
  });
});

describe("verifying an invite registration", () => {
  test("answers 404 for an unknown token before any WebAuthn check", async () => {
    const page = await postJson(site, "/_plumix/auth/invite/register/verify", {
      token: generateToken(),
      response: junkAttestation,
    });

    page.assertNotFound();
  });

  test("answers 410 for an invite that expired before verify", async () => {
    const { token } = await invited({ role: "editor", expiresInMs: -60_000 });

    const page = await postJson(site, "/_plumix/auth/invite/register/verify", {
      token,
      response: junkAttestation,
    });

    expect(page.status).toBe(410);
  });

  test("refuses a body with no response with 400", async () => {
    const page = await postJson(site, "/_plumix/auth/invite/register/verify", {
      token: generateToken(),
    });

    expect(page.status).toBe(400);
  });

  test("emits auth.registered and auth.credentialCreated for the invitee", async () => {
    const { user: invitee, token } = await invited();
    const challenge = await inviteChallenge(token);

    await postJson(site, "/_plumix/auth/invite/register/verify", {
      token,
      response: attestationFor(challenge),
    });

    expect(site.events.emitted(auth.registered)).toHaveLength(1);
    site.events.assertEmitted(auth.registered, { user: { id: invitee.id } });
    expect(site.events.emitted(auth.credentialCreated)).toHaveLength(1);
    site.events.assertEmitted(auth.credentialCreated, {
      credential: { userId: invitee.id },
    });
  });

  test("answers the user and the admin to go to", async () => {
    const { user: invitee, token } = await invited();
    const challenge = await inviteChallenge(token);

    const page = await postJson(site, "/_plumix/auth/invite/register/verify", {
      token,
      response: attestationFor(challenge),
    });

    expect(JSON.parse(page.body)).toEqual({
      userId: invitee.id,
      redirectTo: "/_plumix/admin",
    });
  });
});

describe("a challenge used on the other registration ceremony", () => {
  test("an invite challenge is refused by passkey register verify, enrolling nobody", async () => {
    await site.factory.admin.create();
    const { user, token, tokenHash } = await invited();
    const challenge = await inviteChallenge(token);

    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/verify",
      attestationFor(challenge),
    );

    expect(page.status).toBe(400);
    expect(JSON.parse(page.body)).toEqual({ error: "challenge_mismatch" });
    expect(page.headers.get("set-cookie")).toBeNull();
    const creds = await site.context.db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, user.id));
    expect(creds).toHaveLength(0);
    const invite = await site.context.db
      .select()
      .from(authTokens)
      .where(eq(authTokens.hash, tokenHash));
    expect(invite).toHaveLength(1);
  });

  test("an add-device challenge is refused by invite register verify, keeping the invite", async () => {
    await site.factory.admin.create();
    const { user, token, tokenHash } = await invited();
    const options = await postJson(
      site.actingAs(user),
      "/_plumix/auth/passkey/register/options",
      { email: user.email },
    );
    options.assertOk();

    const page = await postJson(site, "/_plumix/auth/invite/register/verify", {
      token,
      response: attestationFor(challengeOf(options)),
    });

    expect(page.status).toBe(400);
    expect(JSON.parse(page.body)).toEqual({ error: "challenge_mismatch" });
    expect(page.headers.get("set-cookie")).toBeNull();
    const creds = await site.context.db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, user.id));
    expect(creds).toHaveLength(0);
    const invite = await site.context.db
      .select()
      .from(authTokens)
      .where(eq(authTokens.hash, tokenHash));
    expect(invite).toHaveLength(1);
  });

  test("a refused challenge is spent: replaying it to the invite route fails challenge_not_found", async () => {
    await site.factory.admin.create();
    const { token } = await invited();
    const response = attestationFor(await inviteChallenge(token));
    const wrongRoute = await postJson(
      site,
      "/_plumix/auth/passkey/register/verify",
      response,
    );
    wrongRoute.assertJson({ error: "challenge_mismatch" });

    const page = await postJson(site, "/_plumix/auth/invite/register/verify", {
      token,
      response,
    });

    expect(page.status).toBe(400);
    page.assertJson({ error: "challenge_not_found" });
  });
});
