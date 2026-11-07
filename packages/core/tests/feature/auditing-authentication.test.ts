import { describe, expect, test } from "vitest";

import type { AppContext } from "../../src/context/app-context.js";
import { createApiToken } from "../../src/auth/api-tokens.js";
import { SESSION_COOKIE_NAME } from "../../src/auth/cookies.js";
import { generateToken, hashToken } from "../../src/auth/tokens.js";
import { eq } from "../../src/db/index.js";
import { credentials } from "../../src/db/schema/credentials.js";
import { auth } from "../../src/events-and-filters/auth.js";
import { definePlugin } from "../../src/plugin/define.js";
import { fakeMail } from "../../src/test/mail-fake.js";
import { testSite } from "../../src/test/site.js";
import { attestationFor, challengeOf, postJson } from "../support/passkey.js";

// An audit-log plugin subscribes to these emissions, so each state change
// must keep firing with its expected payload.

const signIns: { payload: unknown; ctx: AppContext }[] = [];

const site = await testSite({
  plugins: [
    definePlugin("records-sign-ins", {
      setup: (ctx) => {
        ctx.events.on(auth.signedIn, (payload, handlerCtx) => {
          signIns.push({ payload, ctx: handlerCtx });
        });
      },
    }),
  ],
  config: {
    // Magic link needs a mailer; the site swaps in its own fake for it.
    mailer: fakeMail(),
    auth: {
      magicLink: { siteName: "Test" },
      allowedDomains: { "allowed.test": "member" },
    },
  },
});

const siteWithoutMagicLink = await testSite({ plugins: [] });

const siteWithShortSessions = await testSite({
  plugins: [],
  config: {
    auth: {
      sessions: {
        maxAgeSeconds: 30,
        absoluteMaxAgeSeconds: 60,
        refreshThreshold: 0.5,
      },
    },
  },
});

/**
 * `site.visit` adds the CSRF header to every `/_plumix/` request unless one is
 * given; a link a user clicks carries none.
 */
const AS_A_LINK = { headers: { "x-plumix-request": "" } };

describe("api tokens", () => {
  test("auth.apiTokenCreated fires after a successful mint", async () => {
    const editor = await site.factory.editor.create();

    const result = await site.actingAs(editor).rpc.auth.apiTokens.create({
      name: "ci",
      scopes: ["entry:post:read"],
    });

    expect(site.events.emitted(auth.apiTokenCreated)).toMatchObject([
      {
        apiToken: {
          id: result.token.id,
          userId: editor.id,
          name: "ci",
          scopes: ["entry:post:read"],
        },
        actor: { id: editor.id },
      },
    ]);
  });

  test("auth.apiTokenRevoked fires with mode=self for the owner's revoke", async () => {
    const editor = await site.factory.editor.create();
    const asEditor = site.actingAs(editor);
    const created = await asEditor.rpc.auth.apiTokens.create({ name: "x" });

    await asEditor.rpc.auth.apiTokens.revoke({ id: created.token.id });

    expect(site.events.emitted(auth.apiTokenRevoked)).toMatchObject([
      {
        apiToken: { id: created.token.id, userId: editor.id },
        actor: { id: editor.id },
        mode: "self",
      },
    ]);
  });

  test("auth.apiTokenRevoked fires with mode=admin for adminRevoke", async () => {
    const admin = await site.factory.admin.create();
    const target = await site.factory.user.create({});
    const minted = await createApiToken(site.context.db, {
      userId: target.id,
      name: "leaked",
      expiresAt: null,
    });

    await site
      .actingAs(admin)
      .rpc.auth.apiTokens.adminRevoke({ id: minted.row.id });

    expect(site.events.emitted(auth.apiTokenRevoked)).toMatchObject([
      {
        apiToken: { id: minted.row.id, userId: target.id },
        actor: { id: admin.id },
        mode: "admin",
      },
    ]);
  });
});

describe("device flow", () => {
  test("auth.deviceCodeApproved fires with the row id + scopes", async () => {
    const editor = await site.factory.editor.create();
    const { userCode } = await site.factory.deviceCode.create();

    await site.actingAs(editor).rpc.auth.deviceFlow.approve({
      userCode,
      tokenName: "claude-code",
      scopes: ["entry:post:read"],
    });

    expect(site.events.emitted(auth.deviceCodeApproved)).toMatchObject([
      {
        deviceCode: {
          userCode,
          tokenName: "claude-code",
          scopes: ["entry:post:read"],
        },
        actor: { id: editor.id },
      },
    ]);
  });

  test("auth.deviceCodeDenied fires on explicit deny", async () => {
    const editor = await site.factory.editor.create();
    const { userCode } = await site.factory.deviceCode.create();

    await site.actingAs(editor).rpc.auth.deviceFlow.deny({ userCode });

    expect(site.events.emitted(auth.deviceCodeDenied)).toMatchObject([
      { deviceCode: { userCode }, actor: { id: editor.id } },
    ]);
  });
});

describe("credentials", () => {
  test("auth.credentialRenamed fires on a successful rename", async () => {
    const editor = await site.factory.editor.create();
    const cred = await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "MacBook",
    });

    await site
      .actingAs(editor)
      .rpc.auth.credentials.rename({ id: cred.id, name: "Laptop" });

    expect(site.events.emitted(auth.credentialRenamed)).toMatchObject([
      {
        credential: { id: cred.id, userId: editor.id },
        actor: { id: editor.id },
        name: "Laptop",
      },
    ]);
  });

  test("auth.credentialRevoked fires on a successful delete (when not last)", async () => {
    const editor = await site.factory.editor.create();
    const credA = await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "MacBook",
    });
    await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([4, 5, 6]),
      name: "iPhone",
    });

    await site.actingAs(editor).rpc.auth.credentials.delete({ id: credA.id });

    expect(site.events.emitted(auth.credentialRevoked)).toMatchObject([
      { credential: { id: credA.id }, actor: { id: editor.id } },
    ]);
  });

  test("auth.credentialRevoked does NOT fire on the last-credential conflict", async () => {
    const editor = await site.factory.editor.create();
    const cred = await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Solo",
    });

    await expect(
      site.actingAs(editor).rpc.auth.credentials.delete({ id: cred.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    site.events.assertNotEmitted(auth.credentialRevoked);
  });

  test("auth.credentialCreated does not fire for a passkey inserted straight into the table", async () => {
    const editor = await site.factory.editor.create();

    // Factories bypass the RPC layer; a plugin writing the table directly
    // shouldn't auto-emit either.
    const cred = await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([7, 8, 9]),
      name: "DirectInsert",
    });

    site.events.assertNotEmitted(auth.credentialCreated);
    const stored = await site.context.db
      .select()
      .from(credentials)
      .where(eq(credentials.id, cred.id))
      .get();
    expect(stored?.userId).toBe(editor.id);
  });
});

describe("oauth accounts", () => {
  test("auth.oauthAccountUnlinked fires on a successful unlink", async () => {
    const editor = await siteWithoutMagicLink.factory.editor.create();
    await siteWithoutMagicLink.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
    });
    await siteWithoutMagicLink.factory.oauthAccount.create({
      userId: editor.id,
      provider: "github",
    });

    await siteWithoutMagicLink
      .actingAs(editor)
      .rpc.auth.oauthAccounts.unlink({ provider: "github" });

    const emitted = siteWithoutMagicLink.events.emitted(
      auth.oauthAccountUnlinked,
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.oauthAccount).toEqual({
      provider: "github",
      userId: editor.id,
    });
    expect(emitted[0]?.actor.id).toBe(editor.id);
  });

  test("auth.oauthAccountUnlinked does NOT fire on the last-sign-in conflict", async () => {
    const editor = await siteWithoutMagicLink.factory.editor.create();
    await siteWithoutMagicLink.factory.oauthAccount.create({
      userId: editor.id,
      provider: "github",
    });

    await expect(
      siteWithoutMagicLink
        .actingAs(editor)
        .rpc.auth.oauthAccounts.unlink({ provider: "github" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    siteWithoutMagicLink.events.assertNotEmitted(auth.oauthAccountUnlinked);
  });
});

describe("sessions", () => {
  test("auth.sessionRevoked fires with mode=single for sessions.revoke", async () => {
    const editor = await site.factory.editor.create();
    const other = await site.factory.session.create({ userId: editor.id });

    await site.actingAs(editor).rpc.auth.sessions.revoke({ id: other.id });

    expect(site.events.emitted(auth.sessionRevoked)).toMatchObject([
      { session: { id: other.id }, actor: { id: editor.id }, mode: "single" },
    ]);
  });

  test("auth.sessionRevoked fires once per row with mode=all_others on revokeOthers", async () => {
    // The caller's own session stays; the two others get one emit each.
    const editor = await site.factory.editor.create();
    await site.factory.session.create({ userId: editor.id });
    await site.factory.session.create({ userId: editor.id });

    const result = await site
      .actingAs(editor)
      .rpc.auth.sessions.revokeOthers({});

    expect(result.revoked).toBe(2);
    expect(site.events.emitted(auth.sessionRevoked)).toMatchObject([
      { mode: "all_others", actor: { id: editor.id } },
      { mode: "all_others", actor: { id: editor.id } },
    ]);
  });
});

describe("signing out", () => {
  test("auth.signedOut fires through /_plumix/auth/signout", async () => {
    const editor = await site.factory.editor.create();

    const page = await site
      .actingAs(editor)
      .visit("/_plumix/auth/signout", { method: "POST" });

    expect(page.status).toBe(200);
    expect(site.events.emitted(auth.signedOut)).toMatchObject([
      { user: { id: editor.id } },
    ]);
  });

  test("auth.signedOut is silent for a session past the configured cap", async () => {
    const editor = await siteWithShortSessions.factory.editor.create();
    const token = generateToken();
    await siteWithShortSessions.factory.session.create({
      id: await hashToken(token),
      userId: editor.id,
      createdAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const page = await siteWithShortSessions.visit("/_plumix/auth/signout", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(page.status).toBe(200);
    siteWithShortSessions.events.assertNotEmitted(auth.signedOut);
  });

  test("auth.signedOut is silent when there's no session cookie", async () => {
    const page = await site.visit("/_plumix/auth/signout", { method: "POST" });

    expect(page.status).toBe(200);
    site.events.assertNotEmitted(auth.signedOut);
  });
});

describe("signing in", () => {
  test("a magic-link sign-in hands a subscriber the user, the method and the request ctx", async () => {
    signIns.length = 0;
    const seeded = await site.factory.user.create({
      email: "alice@example.test",
      role: "editor",
    });
    const { token } = await site.factory.authToken.create({
      type: "magic_link",
      userId: seeded.id,
      email: seeded.email,
    });

    await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(signIns).toHaveLength(1);
    expect(signIns[0]?.payload).toMatchObject({
      user: { id: seeded.id, email: "alice@example.test" },
      method: "magic_link",
      firstSignIn: false,
    });
    expect(signIns[0]?.ctx.request.url).toBe(
      `https://cms.example/_plumix/auth/magic-link/verify?token=${token}`,
    );
  });

  test("auth.signedIn fires with method=magic_link, firstSignIn=false on existing-user verify", async () => {
    const seeded = await site.factory.user.create({
      email: "alice@example.test",
      role: "editor",
    });
    const { token } = await site.factory.authToken.create({
      type: "magic_link",
      userId: seeded.id,
      email: seeded.email,
    });

    const page = await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(page.status).toBe(302);
    expect(site.events.emitted(auth.signedIn)).toMatchObject([
      { user: { id: seeded.id }, method: "magic_link", firstSignIn: false },
    ]);
  });

  test("auth.signedIn fires with firstSignIn=true on magic-link signup", async () => {
    // A user exists, so signup isn't bootstrap-gated, and the address's
    // domain is on the allowlist.
    await site.factory.user.create({ email: "existing@allowed.test" });
    const { token } = await site.factory.authToken.create({
      type: "magic_link",
      // A signup row: userId stays null until verify provisions one.
      userId: null,
      email: "newcomer@allowed.test",
    });

    const page = await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(page.status).toBe(302);
    // A fresh provision must surface as firstSignIn.
    expect(site.events.emitted(auth.signedIn)).toMatchObject([
      {
        user: { email: "newcomer@allowed.test" },
        method: "magic_link",
        firstSignIn: true,
      },
    ]);
  });

  test("auth.signedIn fires with firstSignIn=false when a signed-in user registers their first passkey", async () => {
    const seeded = await site.factory.user.create({
      email: "alice@cms.example",
    });

    const page = await registerPasskey(seeded.email, site.actingAs(seeded));

    expect(page.status).toBe(200);
    expect(site.events.emitted(auth.signedIn)).toMatchObject([
      { user: { id: seeded.id }, method: "passkey", firstSignIn: false },
    ]);
  });

  test("auth.signedIn fires with firstSignIn=true on the bootstrap passkey registration", async () => {
    const page = await registerPasskey("admin@cms.example");

    expect(page.status).toBe(200);
    expect(site.events.emitted(auth.signedIn)).toMatchObject([
      {
        user: { email: "admin@cms.example" },
        method: "passkey",
        firstSignIn: true,
      },
    ]);
  });

  test("auth.signedIn fires with firstSignIn=true on invite accept", async () => {
    const { invitee, token } = await invited();
    const options = await postJson(
      site,
      "/_plumix/auth/invite/register/options",
      { token },
    );
    expect(options.status).toBe(200);

    const page = await postJson(site, "/_plumix/auth/invite/register/verify", {
      token,
      response: attestationFor(inviteChallengeOf(options.body)),
    });

    expect(page.status).toBe(200);
    expect(site.events.emitted(auth.signedIn)).toMatchObject([
      { user: { id: invitee.id }, method: "invite", firstSignIn: true },
    ]);
  });

  test("no sign-in or credential event fires when an invite challenge is sent to passkey register verify", async () => {
    const { token } = await invited();
    const options = await postJson(
      site,
      "/_plumix/auth/invite/register/options",
      { token },
    );
    expect(options.status).toBe(200);

    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/verify",
      attestationFor(inviteChallengeOf(options.body)),
    );

    expect(page.status).toBe(400);
    site.events.assertNotEmitted(auth.signedIn);
    site.events.assertNotEmitted(auth.credentialCreated);
  });
});

/**
 * Asks for registration options as `as` decides, then verifies with no
 * cookie: the options request decided add-device or bootstrap, and a session
 * may end mid-ceremony.
 */
async function registerPasskey(
  email: string,
  as: Pick<typeof site, "visit"> = site,
) {
  const options = await postJson(as, "/_plumix/auth/passkey/register/options", {
    email,
  });
  expect(options.status).toBe(200);
  return postJson(
    site,
    "/_plumix/auth/passkey/register/verify",
    attestationFor(challengeOf(options)),
  );
}

async function invited() {
  const invitee = await site.factory.user.create({ role: "author" });
  const token = generateToken();
  await site.factory.invite.create({
    hash: await hashToken(token),
    userId: invitee.id,
    email: invitee.email,
    role: "author",
    expiresAt: new Date(Date.now() + 60_000),
  });
  return { invitee, token };
}

function inviteChallengeOf(body: string): string {
  const { options } = JSON.parse(body) as { options: { challenge: string } };
  return options.challenge;
}
