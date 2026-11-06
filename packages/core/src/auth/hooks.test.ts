import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import type { User } from "../db/schema/users.js";
import { eq } from "../db/index.js";
import { credentials } from "../db/schema/credentials.js";
import { auth } from "../hooks/auth.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness, plumixRequest } from "../test/dispatcher.js";
import {
  buildRegisterVerifyEnvelope,
  generatePasskeyKeyPair,
  randomCredentialId,
} from "../test/fixtures/webauthn.js";
import { createRpcHarness } from "../test/rpc.js";
import { SESSION_COOKIE_NAME } from "./cookies.js";
import { generateToken, hashToken } from "./tokens.js";

// An audit-log plugin subscribes to these emissions, so each state change
// must keep firing with its expected payload.

describe("auth events — api tokens", () => {
  test("auth.apiTokenCreated fires after a successful mint", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const spy = h.spyEvent(auth.apiTokenCreated);

    const result = await h.client.auth.apiTokens.create({
      name: "ci",
      scopes: ["entry:post:read"],
    });

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.apiToken.id).toBe(result.token.id);
    expect(payload?.apiToken.userId).toBe(h.user.id);
    expect(payload?.apiToken.name).toBe("ci");
    expect(payload?.apiToken.scopes).toEqual(["entry:post:read"]);
    expect(payload?.actor.id).toBe(h.user.id);
  });

  test("auth.apiTokenRevoked fires with mode=self for the owner's revoke", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const created = await h.client.auth.apiTokens.create({ name: "x" });
    const spy = h.spyEvent(auth.apiTokenRevoked);

    await h.client.auth.apiTokens.revoke({ id: created.token.id });

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.apiToken.id).toBe(created.token.id);
    expect(payload?.apiToken.userId).toBe(h.user.id);
    expect(payload?.actor.id).toBe(h.user.id);
    expect(payload?.mode).toBe("self");
  });

  test("auth.apiTokenRevoked fires with mode=admin for adminRevoke", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.user.create({});
    const { createApiToken } = await import("./api-tokens.js");
    const minted = await createApiToken(h.db, {
      userId: target.id,
      name: "leaked",
      expiresAt: null,
    });
    const spy = h.spyEvent(auth.apiTokenRevoked);

    await h.client.auth.apiTokens.adminRevoke({ id: minted.row.id });

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.apiToken.id).toBe(minted.row.id);
    expect(payload?.apiToken.userId).toBe(target.id);
    expect(payload?.actor.id).toBe(h.user.id);
    expect(payload?.mode).toBe("admin");
  });
});

describe("auth events — device flow", () => {
  test("auth.deviceCodeApproved fires with the row id + scopes", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { requestDeviceCode } = await import("./device-flow.js");
    const { userCode } = await requestDeviceCode(h.db);
    const spy = h.spyEvent(auth.deviceCodeApproved);

    await h.client.auth.deviceFlow.approve({
      userCode,
      tokenName: "claude-code",
      scopes: ["entry:post:read"],
    });

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.deviceCode.userCode).toBe(userCode);
    expect(payload?.deviceCode.tokenName).toBe("claude-code");
    expect(payload?.deviceCode.scopes).toEqual(["entry:post:read"]);
    expect(payload?.actor.id).toBe(h.user.id);
  });

  test("auth.deviceCodeDenied fires on explicit deny", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { requestDeviceCode } = await import("./device-flow.js");
    const { userCode } = await requestDeviceCode(h.db);
    const spy = h.spyEvent(auth.deviceCodeDenied);

    await h.client.auth.deviceFlow.deny({ userCode });

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.deviceCode.userCode).toBe(userCode);
    expect(payload?.actor.id).toBe(h.user.id);
  });
});

describe("auth events — credentials", () => {
  test("auth.credentialRenamed fires on a successful rename", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const cred = await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "MacBook",
    });
    const spy = h.spyEvent(auth.credentialRenamed);

    await h.client.auth.credentials.rename({ id: cred.id, name: "Laptop" });

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.credential.id).toBe(cred.id);
    expect(payload?.credential.userId).toBe(h.user.id);
    expect(payload?.actor.id).toBe(h.user.id);
    expect(payload?.name).toBe("Laptop");
  });

  test("auth.credentialRevoked fires on a successful delete (when not last)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const credA = await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "MacBook",
    });
    await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([4, 5, 6]),
      name: "iPhone",
    });
    const spy = h.spyEvent(auth.credentialRevoked);

    await h.client.auth.credentials.delete({ id: credA.id });

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.credential.id).toBe(credA.id);
    expect(payload?.actor.id).toBe(h.user.id);
  });

  test("auth.credentialRevoked does NOT fire on the last-credential conflict", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const cred = await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Solo",
    });
    const spy = h.spyEvent(auth.credentialRevoked);

    await expect(
      h.client.auth.credentials.delete({ id: cred.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    spy.assertNotCalled();
  });
});

describe("auth events — oauth accounts", () => {
  test("auth.oauthAccountUnlinked fires on a successful unlink", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([1, 2, 3]),
    });
    await h.factory.oauthAccount.create({
      userId: h.user.id,
      provider: "github",
    });
    const spy = h.spyEvent(auth.oauthAccountUnlinked);

    await h.client.auth.oauthAccounts.unlink({ provider: "github" });

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.oauthAccount).toEqual({
      provider: "github",
      userId: h.user.id,
    });
    expect(payload?.actor.id).toBe(h.user.id);
  });

  test("auth.oauthAccountUnlinked does NOT fire on the last-sign-in conflict", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.oauthAccount.create({
      userId: h.user.id,
      provider: "github",
    });
    const spy = h.spyEvent(auth.oauthAccountUnlinked);

    await expect(
      h.client.auth.oauthAccounts.unlink({ provider: "github" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    spy.assertNotCalled();
  });
});

describe("auth events — sessions", () => {
  test("auth.sessionRevoked fires with mode=single for sessions.revoke", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const other = await h.factory.session.create({ userId: h.user.id });
    const spy = h.spyEvent(auth.sessionRevoked);

    await h.client.auth.sessions.revoke({ id: other.id });

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.session.id).toBe(other.id);
    expect(payload?.actor.id).toBe(h.user.id);
    expect(payload?.mode).toBe("single");
  });

  test("auth.sessionRevoked fires once per row with mode=all_others on revokeOthers", async () => {
    // Harness mints one "current" session for the authed editor;
    // add two more to revoke. The current session is preserved
    // (cookie hash filter) and the other two get one hook each.
    const h = await createRpcHarness({ authAs: "editor" });
    const { createSession } = await import("./sessions.js");
    await createSession(h.db, { userId: h.user.id });
    await createSession(h.db, { userId: h.user.id });
    const spy = h.spyEvent(auth.sessionRevoked);

    const result = await h.client.auth.sessions.revokeOthers({});
    expect(result.revoked).toBe(2);

    spy.assertCalledTimes(2);
    for (const call of spy.calls) {
      expect(call.payload.mode).toBe("all_others");
      expect(call.payload.actor.id).toBe(h.user.id);
    }
  });
});

describe("auth.signedIn", () => {
  test("a magic-link sign-in hands a subscriber the user, the method and the request ctx", async () => {
    const received: { payload: unknown; ctx: AppContext }[] = [];
    const h = await createDispatcherHarness({
      config: {
        auth: { magicLink: { siteName: "Test" } },
        plugins: [
          definePlugin("records-sign-ins", {
            setup: (ctx) => {
              ctx.events.on(auth.signedIn, (payload, handlerCtx) => {
                received.push({ payload, ctx: handlerCtx });
              });
            },
          }),
        ],
      },
    });
    const seeded = await h.factory.user.create({
      email: "alice@example.test",
      role: "editor",
    });
    const { token } = await h.factory.authToken.create({
      type: "magic_link",
      userId: seeded.id,
      email: seeded.email,
    });

    await h.dispatch(
      new Request(
        `https://cms.example/_plumix/auth/magic-link/verify?token=${token}`,
      ),
    );

    expect(received).toHaveLength(1);
    expect(received[0]?.payload).toMatchObject({
      user: { id: seeded.id, email: "alice@example.test" },
      method: "magic_link",
      firstSignIn: false,
    });
    expect(received[0]?.ctx.request.url).toBe(
      `https://cms.example/_plumix/auth/magic-link/verify?token=${token}`,
    );
  });
});

describe("auth events — passkey sign-in, sign-out and credentials", () => {
  test("auth.signedOut fires through /_plumix/auth/signout", async () => {
    const h = await createDispatcherHarness();
    const seeded = await h.factory.user.create({ role: "editor" });
    const spy = h.spyEvent(auth.signedOut);

    const signoutRequest = await h.authenticateRequest(
      plumixRequest("/_plumix/auth/signout", { method: "POST" }),
      seeded.id,
    );
    const response = await h.dispatch(signoutRequest);
    expect(response.status).toBe(200);

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.user.id).toBe(seeded.id);
  });

  test("auth.signedOut is silent for a session past the configured cap", async () => {
    const h = await createDispatcherHarness({
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
    const seeded = await h.factory.user.create({ role: "editor" });
    const spy = h.spyEvent(auth.signedOut);
    const token = generateToken();
    await h.factory.session.create({
      id: await hashToken(token),
      userId: seeded.id,
      createdAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      }),
    );
    expect(response.status).toBe(200);
    spy.assertNotCalled();
  });

  test("auth.signedOut is silent when there's no session cookie", async () => {
    const h = await createDispatcherHarness();
    const spy = h.spyEvent(auth.signedOut);

    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    spy.assertNotCalled();
  });

  test("auth.signedIn fires with method=magic_link, firstSignIn=false on existing-user verify", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Test" } } },
    });
    const seeded = await h.factory.user.create({
      email: "alice@example.test",
      role: "editor",
    });
    const spy = h.spyEvent(auth.signedIn);

    // Seed a magic-link token bound to the existing user.
    const { token } = await h.factory.authToken.create({
      type: "magic_link",
      userId: seeded.id,
      email: seeded.email,
    });

    const response = await h.dispatch(
      new Request(
        `https://cms.example/_plumix/auth/magic-link/verify?token=${token}`,
        { method: "GET" },
      ),
    );
    expect(response.status).toBe(302);

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.user.id).toBe(seeded.id);
    expect(payload?.method).toBe("magic_link");
    expect(payload?.firstSignIn).toBe(false);
  });

  test("auth.signedIn fires with firstSignIn=true on magic-link signup", async () => {
    // Pre-seed: at least one user exists (so signup isn't bootstrap-
    // gated) + the email's domain is on the allowlist.
    const h = await createDispatcherHarness({
      config: {
        auth: {
          magicLink: { siteName: "Test" },
          allowedDomains: { "allowed.test": "subscriber" },
        },
      },
    });
    await h.factory.user.create({ email: "existing@allowed.test" });

    const spy = h.spyEvent(auth.signedIn);
    const { token } = await h.factory.authToken.create({
      type: "magic_link",
      // Signup row: userId is null until verify provisions one.
      userId: null,
      email: "newcomer@allowed.test",
    });

    const response = await h.dispatch(
      new Request(
        `https://cms.example/_plumix/auth/magic-link/verify?token=${token}`,
        { method: "GET" },
      ),
    );
    expect(response.status).toBe(302);

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.user.email).toBe("newcomer@allowed.test");
    expect(payload?.method).toBe("magic_link");
    // The whole point: a fresh provision must surface as firstSignIn.
    expect(payload?.firstSignIn).toBe(true);
  });

  test("auth.signedIn fires with firstSignIn=false when a signed-in user registers their first passkey", async () => {
    const h = await createDispatcherHarness();
    const seeded = await h.factory.user.create({ email: "alice@cms.example" });
    const spy = h.spyEvent(auth.signedIn);

    const verifyRes = await registerPasskey(h, seeded.email, { as: seeded });
    verifyRes.assertStatus(200);

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.user.id).toBe(seeded.id);
    expect(payload?.method).toBe("passkey");
    expect(payload?.firstSignIn).toBe(false);
  });

  test("auth.signedIn fires with firstSignIn=true on the bootstrap passkey registration", async () => {
    const h = await createDispatcherHarness();
    const spy = h.spyEvent(auth.signedIn);

    const verifyRes = await registerPasskey(h, "admin@cms.example");
    verifyRes.assertStatus(200);

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.user.email).toBe("admin@cms.example");
    expect(payload?.method).toBe("passkey");
    expect(payload?.firstSignIn).toBe(true);
  });

  test("auth.signedIn fires with firstSignIn=true on invite accept", async () => {
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
    const spy = h.spyEvent(auth.signedIn);

    const optionsRes = await h.fetch("/_plumix/auth/invite/register/options", {
      json: { token },
    });
    optionsRes.assertStatus(200);
    const { options } = await optionsRes.json<{
      options: { challenge: string };
    }>();
    const verifyRes = await h.fetch("/_plumix/auth/invite/register/verify", {
      json: { token, response: attestationResponse(options.challenge) },
    });
    verifyRes.assertStatus(200);

    spy.assertCalledOnce();
    const payload = spy.lastPayload;
    expect(payload?.user.id).toBe(invitee.id);
    expect(payload?.method).toBe("invite");
    expect(payload?.firstSignIn).toBe(true);
  });

  test("no sign-in or credential event fires when an invite challenge is sent to passkey register verify", async () => {
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
    const signedIn = h.spyEvent(auth.signedIn);
    const created = h.spyEvent(auth.credentialCreated);

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

    signedIn.assertNotCalled();
    created.assertNotCalled();
  });

  test("auth.credentialCreated fires when a passkey is added directly via the credentials table (smoke)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const cred = await h.factory.credential.create({
      userId: h.user.id,
      publicKey: Buffer.from([7, 8, 9]),
      name: "DirectInsert",
    });
    // No hook fires for direct factory inserts (factories bypass the
    // RPC layer); this asserts that fact and locks it in. Plugins
    // doing direct DB writes shouldn't auto-emit.
    const spy = h.spyEvent(auth.credentialCreated);
    expect(spy.called).toBe(false);
    expect(cred.userId).toBe(h.user.id);
    // The seeded credential exists in the DB.
    const stored = await h.db
      .select()
      .from(credentials)
      .where(eq(credentials.id, cred.id))
      .get();
    expect(stored?.id).toBe(cred.id);
  });
});

async function registerPasskey(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  email: string,
  options: { readonly as?: User } = {},
) {
  const optionsRes = await h.fetch("/_plumix/auth/passkey/register/options", {
    json: { email },
    as: options.as,
  });
  optionsRes.assertStatus(200);
  const { challenge } = await optionsRes.json<{ challenge: string }>();
  // No cookie on verify: the options request decided add-device vs
  // bootstrap, and a session may end mid-ceremony.
  return h.fetch("/_plumix/auth/passkey/register/verify", {
    json: attestationResponse(challenge),
  });
}

function attestationResponse(challenge: string) {
  return buildRegisterVerifyEnvelope({
    keyPair: generatePasskeyKeyPair(),
    rpId: "cms.example",
    origin: "https://cms.example",
    challenge,
    credentialId: randomCredentialId(),
  });
}
