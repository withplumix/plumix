import { describe, expect, test } from "vitest";

import { SESSION_COOKIE_NAME } from "../../src/auth/cookies.js";
import { eq, sql } from "../../src/db/index.js";
import { users } from "../../src/db/schema/users.js";
import {
  buildAssertion,
  buildRegisterVerifyEnvelope,
  generatePasskeyKeyPair,
  randomCredentialId,
} from "../../src/test/fixtures/webauthn.js";
import { testSite } from "../../src/test/site.js";
import {
  challengeOf,
  enrolPasskey,
  postJson,
  signInWithPasskey,
} from "../support/passkey.js";

const site = await testSite({ plugins: [] });

describe("verifying a passkey sign-in", () => {
  test("refuses a wildly oversized payload by its schema, before the WebAuthn parsers", async () => {
    const page = await postJson(site, "/_plumix/auth/passkey/login/verify", {
      id: "a".repeat(2048),
      rawId: "a",
      type: "public-key",
      response: {
        clientDataJSON: "a",
        authenticatorData: "a",
        signature: "a",
      },
    });

    expect(page.status).toBe(400);
  });

  test("answers the user and the admin to go to", async () => {
    const enrolled = await enrolPasskey(site, "admin@cms.example");

    const page = await signInWithPasskey(site, enrolled);

    const user = await site.context.db.query.users.findFirst({
      where: eq(users.email, "admin@cms.example"),
    });
    expect(JSON.parse(page.body)).toEqual({
      userId: user?.id,
      redirectTo: "/_plumix/admin",
    });
  });

  test.each([
    ["https://evil.example/", "/"],
    ["//evil.example", "/"],
    ["/../x", "/"],
    ["/account", "/account"],
  ])("answers %s in ?redirectTo= with %s", async (value, expected) => {
    const enrolled = await enrolPasskey(site, "admin@cms.example");

    const page = await signInWithPasskey(
      site,
      enrolled,
      `?${new URLSearchParams({ redirectTo: value }).toString()}`,
    );

    page.assertJson({ redirectTo: expected });
  });

  test("refuses a disabled account with 403 account_disabled, setting no cookie", async () => {
    const enrolled = await enrolPasskey(site, "admin@cms.example");
    await site.context.db
      .update(users)
      .set({ disabledAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(users.email, "admin@cms.example"));

    const page = await signInWithPasskey(site, enrolled);

    page.assertForbidden();
    expect(JSON.parse(page.body)).toEqual({ error: "account_disabled" });
    expect(page.headers.get("set-cookie")).toBeNull();
  });

  test("refuses a passkey whose user row is gone with 403 link_broken", async () => {
    const enrolled = await enrolPasskey(site, "admin@cms.example");
    const { db } = site.context;
    await db.run(sql`PRAGMA foreign_keys = OFF`);
    await db.delete(users).where(eq(users.email, "admin@cms.example"));
    await db.run(sql`PRAGMA foreign_keys = ON`);

    const page = await signInWithPasskey(site, enrolled);

    page.assertForbidden();
    expect(JSON.parse(page.body)).toEqual({ error: "link_broken" });
  });
});

// A regression in the wire schema, CSRF gate or session plumbing shows up
// here, at the step it broke, rather than at deploy time.
describe("signing in again with a registered passkey", () => {
  test("registers, signs out, and signs back in with the same passkey", async () => {
    const keyPair = generatePasskeyKeyPair();
    const email = "e2e@cms.example";

    const registerOptions = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      { email },
    );
    registerOptions.assertOk();
    const envelope = buildRegisterVerifyEnvelope({
      keyPair,
      rpId: "cms.example",
      origin: "https://cms.example",
      challenge: challengeOf(registerOptions),
      credentialId: randomCredentialId(),
    });
    const registered = await postJson(
      site,
      "/_plumix/auth/passkey/register/verify",
      envelope,
    );
    registered.assertOk();
    expect(registered.headers.get("set-cookie")).toContain(
      `${SESSION_COOKIE_NAME}=`,
    );

    const [sessionCookie = ""] = (
      registered.headers.get("set-cookie") ?? ""
    ).split(";");
    const signedOut = await site.visit("/_plumix/auth/signout", {
      method: "POST",
      headers: { cookie: sessionCookie },
    });
    signedOut.assertOk();

    const loginOptions = await postJson(
      site,
      "/_plumix/auth/passkey/login/options",
      { email },
    );
    loginOptions.assertOk();
    const assertion = buildAssertion({
      keyPair,
      rpId: "cms.example",
      origin: "https://cms.example",
      challenge: challengeOf(loginOptions),
      counter: 1,
    });
    const signedIn = await postJson(
      site,
      "/_plumix/auth/passkey/login/verify",
      {
        id: envelope.id,
        rawId: envelope.id,
        type: "public-key",
        response: {
          clientDataJSON: assertion.clientDataJSON,
          authenticatorData: assertion.authenticatorData,
          signature: assertion.signature,
        },
      },
    );
    signedIn.assertOk();
    expect(signedIn.headers.get("set-cookie")).toContain(
      `${SESSION_COOKIE_NAME}=`,
    );
  });
});
