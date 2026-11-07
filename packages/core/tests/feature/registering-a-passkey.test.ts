import { describe, expect, test } from "vitest";

import { SESSION_COOKIE_NAME } from "../../src/auth/cookies.js";
import { issueChallenge } from "../../src/auth/passkey/challenges.js";
import { eq } from "../../src/db/index.js";
import { users } from "../../src/db/schema/users.js";
import { auth } from "../../src/events-and-filters/auth.js";
import { definePlugin } from "../../src/plugin/define.js";
import { text } from "../../src/plugin/fields/index.js";
import { testSite } from "../../src/test/site.js";
import { attestationFor, enrolPasskey, postJson } from "../support/passkey.js";

const profiles = definePlugin("profiles", {
  setup: (ctx) => {
    ctx.registerUserMetaBox("profile", {
      label: "Profile",
      fields: [text("pronouns").default("they/them"), text("bio")],
    });
  },
});

const site = await testSite({ plugins: [profiles] });

describe("asking for passkey registration options", () => {
  test("bootstraps the first user and issues a challenge", async () => {
    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      {
        email: "admin@cms.example",
      },
    );

    expect(page.status).toBe(200);
    expect(JSON.parse(page.body)).toMatchObject({
      challenge: expect.any(String) as unknown,
      user: { name: "admin@cms.example" },
    });
  });

  // A user the passkey bootstrap provisions is a new entity, so it starts from
  // the user fields' defaults (ADR 0026).
  test("stores the user fields' defaults on the bootstrapped user", async () => {
    await postJson(site, "/_plumix/auth/passkey/register/options", {
      email: "admin@cms.example",
    });

    const created = await site.context.db.query.users.findFirst({
      where: eq(users.email, "admin@cms.example"),
    });
    expect(created?.meta).toEqual({ pronouns: "they/them" });
  });

  test("bootstraps one user when two requests race for the same email", async () => {
    const pages = await Promise.all([
      postJson(site, "/_plumix/auth/passkey/register/options", {
        email: "same@cms.example",
      }),
      postJson(site, "/_plumix/auth/passkey/register/options", {
        email: "same@cms.example",
      }),
    ]);

    expect(pages.map((page) => page.status)).toEqual([200, 200]);
    // The race is decided by UNIQUE(email): exactly one row must exist after
    // both options calls settle, regardless of which request won the insert.
    const rows = await site.context.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "same@cms.example"));
    expect(rows).toHaveLength(1);
  });

  test("refuses an invalid email with 400", async () => {
    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      {
        email: "not-an-email",
      },
    );

    expect(page.status).toBe(400);
  });

  test("is closed to a visitor once a user exists", async () => {
    await site.factory.admin.create();

    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      {
        email: "stranger@example.com",
      },
    );

    page.assertForbidden().assertJson({ error: "registration_closed" });
  });

  test("refuses a signed-in user asking for another email", async () => {
    const page = await postJson(
      site.actingAs("author"),
      "/_plumix/auth/passkey/register/options",
      { email: "somebody-else@example.com" },
    );

    page.assertForbidden().assertJson({ error: "email_mismatch" });
  });

  test("lets a signed-in user enrol another device for their own email", async () => {
    const editor = await site.factory.editor.create();

    const page = await postJson(
      site.actingAs(editor),
      "/_plumix/auth/passkey/register/options",
      { email: editor.email },
    );

    page.assertOk();
  });

  test("leaves out excludeCredentials for a visitor, so no answer tells who exists", async () => {
    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      {
        email: "first@example.com",
      },
    );

    expect(page.status).toBe(200);
    expect(JSON.parse(page.body)).not.toHaveProperty("excludeCredentials");
  });
});

describe("asking for passkey registration options with an api token", () => {
  test.each([
    ["a scoped token", ["entry:post:read"]],
    ["an unscoped token", null],
  ])(
    "%s is refused with registration_closed",
    async (_label, scopes: string[] | null) => {
      const admin = await site.factory.admin.create();
      const { secret } = await site.factory.apiToken.create({
        userId: admin.id,
        scopes,
      });

      const page = await postJson(
        site,
        "/_plumix/auth/passkey/register/options",
        { email: admin.email },
        { authorization: `Bearer ${secret}` },
      );

      page.assertForbidden().assertJson({ error: "registration_closed" });
    },
  );

  test("a token sent with a junk session cookie is refused with registration_closed", async () => {
    const admin = await site.factory.admin.create();
    const { secret } = await site.factory.apiToken.create({ userId: admin.id });

    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/options",
      { email: admin.email },
      {
        authorization: `Bearer ${secret}`,
        cookie: `${SESSION_COOKIE_NAME}=not-a-real-session`,
      },
    );

    page.assertForbidden().assertJson({ error: "registration_closed" });
  });
});

describe("verifying a passkey registration", () => {
  test("refuses a malformed body with 400 invalid_input, not a 500", async () => {
    const page = await postJson(site, "/_plumix/auth/passkey/register/verify", {
      id: "x",
      type: "not-a-key",
    });

    expect(page.status).toBe(400);
    page.assertJson({ error: "invalid_input" });
  });

  test("refuses a challenge bound to no user with challenge_not_bound_to_user", async () => {
    // The options route always binds a userId; bypass it by issuing a raw
    // challenge directly so the userId === null branch is reachable.
    const { challenge } = await issueChallenge(site.context.db, 60_000);

    const page = await postJson(
      site,
      "/_plumix/auth/passkey/register/verify",
      attestationFor(challenge),
    );

    expect(page.status).toBe(400);
    page.assertJson({ error: "challenge_not_bound_to_user" });
  });

  test("answers the user and the admin to go to", async () => {
    const { registered } = await enrolPasskey(site, "admin@cms.example");

    const user = await site.context.db.query.users.findFirst({
      where: eq(users.email, "admin@cms.example"),
    });
    expect(JSON.parse(registered.body)).toEqual({
      userId: user?.id,
      redirectTo: "/_plumix/admin",
    });
  });

  test("emits auth.credentialCreated for the new passkey", async () => {
    await enrolPasskey(site, "admin@cms.example");

    const user = await site.context.db.query.users.findFirst({
      where: eq(users.email, "admin@cms.example"),
    });
    expect(site.events.emitted(auth.credentialCreated)).toHaveLength(1);
    site.events.assertEmitted(auth.credentialCreated, {
      credential: { userId: user?.id },
    });
  });
});
