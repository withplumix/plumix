import { describe, expect, test } from "vitest";

import type { AuthResult } from "../../src/context/authenticator.js";
import { eq } from "../../src/db/index.js";
import { users } from "../../src/db/schema/users.js";
import { testSite } from "../../src/test/site.js";
import { postJson } from "../support/passkey.js";

/**
 * An SSO authenticator resolving the caller from its own header, with no
 * session cookie: `x-sso-user` names the email, and
 * `x-sso-credential: api-token` makes it an api token.
 */
const site = await testSite({
  config: {
    auth: {
      authenticator: {
        authenticate: async (request, db): Promise<AuthResult | null> => {
          const email = request.headers.get("x-sso-user");
          if (email === null) return null;
          const user = await db.query.users.findFirst({
            where: eq(users.email, email),
          });
          if (user === undefined) return null;
          if (request.headers.get("x-sso-credential") !== "api-token") {
            return { user, credential: "session" };
          }
          return {
            user,
            credential: "api-token",
            tokenScopes: null,
            apiToken: { id: "token-hash", name: "ci" },
          };
        },
      },
    },
  },
});

describe("asking for passkey registration options behind single sign-on", () => {
  test("a session caller with no cookie enrols another passkey for their own email", async () => {
    const editor = await site.factory.editor.create();

    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      { email: editor.email },
      { "x-sso-user": editor.email },
    );

    page.assertOk();
  });

  test("leaves out the caller's enrolled passkeys", async () => {
    const editor = await site.factory.editor.create();
    const enrolled = await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
    });

    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      { email: editor.email },
      { "x-sso-user": editor.email },
    );

    expect(page.status).toBe(200);
    page.assertJson({ excludeCredentials: [{ id: enrolled.id }] });
  });

  test("a session caller asking for another email is refused with email_mismatch", async () => {
    const editor = await site.factory.editor.create();

    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      { email: "somebody-else@example.com" },
      { "x-sso-user": editor.email },
    );

    page.assertForbidden();
    expect(JSON.parse(page.body)).toEqual({ error: "email_mismatch" });
  });

  test("an api-token caller counts as anonymous, whatever header carried it", async () => {
    const editor = await site.factory.editor.create();

    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      { email: editor.email },
      { "x-sso-user": editor.email, "x-sso-credential": "api-token" },
    );

    page.assertForbidden();
    expect(JSON.parse(page.body)).toEqual({ error: "registration_closed" });
  });

  test("an anonymous caller is refused once a user exists", async () => {
    await site.factory.admin.create();

    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      { email: "stranger@example.com" },
    );

    page.assertForbidden();
    expect(JSON.parse(page.body)).toEqual({ error: "registration_closed" });
  });

  test("an anonymous caller bootstraps the first user", async () => {
    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      { email: "first@example.com" },
    );

    page.assertOk();
  });
});
