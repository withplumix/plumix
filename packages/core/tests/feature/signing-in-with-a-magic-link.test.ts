import { describe, expect, test } from "vitest";

import { eq, sql } from "../../src/db/index.js";
import { authTokens } from "../../src/db/schema/auth_tokens.js";
import { sessions } from "../../src/db/schema/sessions.js";
import { users } from "../../src/db/schema/users.js";
import { fakeMail } from "../../src/test/mail-fake.js";
import { testSite } from "../../src/test/site.js";

/** Magic link needs a mailer; the site swaps in its own fake for it. */
const site = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: { magicLink: { siteName: "Plumix Test" } },
  },
});

const siteWithoutMagicLink = await testSite({ plugins: [] });

const siteUnderABasePath = await testSite({
  plugins: [],
  config: {
    basePath: "/custom-directory",
    mailer: fakeMail(),
    auth: { magicLink: { siteName: "Plumix Test" } },
  },
});

const siteWithThemeLogin = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: {
      magicLink: { siteName: "Plumix Test" },
      loginPath: "/account/login",
    },
  },
});

const siteWithThemeLoginUnderABasePath = await testSite({
  plugins: [],
  config: {
    basePath: "/custom-directory",
    mailer: fakeMail(),
    auth: {
      magicLink: { siteName: "Plumix Test" },
      loginPath: "/account/login",
    },
  },
});

/**
 * A click on the emailed link carries no CSRF header, so the route answers
 * with a redirect, not a fetch's JSON.
 */
const AS_A_LINK = { headers: { "x-plumix-request": "" } };

describe("verifying a magic link", () => {
  test("lands on magic_link_error=missing_token without a token", async () => {
    const page = await site.visit("/_plumix/auth/magic-link/verify", AS_A_LINK);

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain(
      "magic_link_error=missing_token",
    );
  });

  test("signs the user in and lands on the admin", async () => {
    const user = await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: "alice@example.com",
    });

    const page = await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    page.assertRedirect("/_plumix/admin");
    expect(page.status).toBe(302);
    expect(page.headers.get("set-cookie")).toContain("plumix_session=");
  });

  test("mints one session for the user", async () => {
    const user = await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: "alice@example.com",
    });

    await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    const rows = await site.context.db.select().from(sessions);
    expect(rows.map((row) => row.userId)).toEqual([user.id]);
  });

  // The runtime supplies no address under a test site; that a supplied one is
  // clipped to the column's cap is `readClientMeta`'s, in
  // src/auth/sessions.test.ts.
  test("records no address when the runtime supplied none, whatever the request forwards", async () => {
    const user = await site.factory.user.create({ email: "alice@example.com" });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: "alice@example.com",
    });

    await site.visit(`/_plumix/auth/magic-link/verify?token=${token}`, {
      headers: {
        ...AS_A_LINK.headers,
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.9",
      },
    });

    const [session] = await site.context.db.select().from(sessions);
    expect(session?.ipAddress).toBeNull();
  });

  test("scopes the redirect and the cookie to the basePath", async () => {
    const user = await siteUnderABasePath.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const { token } = await siteUnderABasePath.factory.authToken.create({
      userId: user.id,
      email: "alice@example.com",
    });

    const page = await siteUnderABasePath.visit(
      `/custom-directory/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe(
      "/custom-directory/_plumix/admin",
    );
    expect(page.headers.get("set-cookie")).toContain("Path=/custom-directory");
  });

  test("honours a safe redirectTo", async () => {
    const user = await site.factory.user.create({
      email: "alice@example.com",
      role: "member",
    });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: "alice@example.com",
    });

    const page = await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}&redirectTo=%2Faccount%2Fsaved`,
      AS_A_LINK,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/account/saved");
    expect(page.headers.get("set-cookie")).toContain("plumix_session=");
  });

  test("lands on the site root for an unsafe redirectTo", async () => {
    const user = await site.factory.user.create({
      email: "alice@example.com",
      role: "member",
    });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: "alice@example.com",
    });

    const page = await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}&redirectTo=%2F%2Fevil.com`,
      AS_A_LINK,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/");
  });

  test("returns to the theme page the request named", async () => {
    await site.factory.user.create({
      email: "reader@example.com",
      role: "member",
    });
    await site.visit("/_plumix/auth/magic-link/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "reader@example.com",
        redirectTo: "/blog/hello-world",
      }),
    });
    const verifyUrl = site.mail.sent("magicLink")[0]?.props.url ?? "";

    const page = await site.visit(verifyUrl, AS_A_LINK);

    expect(verifyUrl).toMatch(/redirectTo=%2Fblog%2Fhello-world/);
    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/blog/hello-world");
    expect(page.headers.get("set-cookie")).toContain("plumix_session=");
  });

  test("signs nobody in with magic links off, from a token issued earlier", async () => {
    const user = await siteWithoutMagicLink.factory.user.create({
      email: "alice@example.com",
    });
    const { token } = await siteWithoutMagicLink.factory.authToken.create({
      userId: user.id,
      email: "alice@example.com",
    });

    const page = await siteWithoutMagicLink.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(page.headers.get("location")).toContain(
      "magic_link_error=token_invalid",
    );
    expect(page.headers.get("set-cookie")).toBeNull();
  });

  test("refuses an unknown token as token_invalid", async () => {
    const page = await site.visit(
      "/_plumix/auth/magic-link/verify?token=not-a-real-token",
      AS_A_LINK,
    );

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toContain(
      "magic_link_error=token_invalid",
    );
  });

  test("refuses an expired token as token_expired", async () => {
    const user = await site.factory.user.create({ role: "editor" });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: user.email,
    });
    site.travel({ minutes: 16 });

    const page = await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(page.headers.get("location")).toContain(
      "magic_link_error=token_expired",
    );
  });

  test("refuses a disabled user as account_disabled", async () => {
    const user = await site.factory.user.create({
      role: "editor",
      disabledAt: new Date("2026-01-01T00:00:00Z"),
    });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: user.email,
    });

    const page = await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(page.headers.get("location")).toContain(
      "magic_link_error=account_disabled",
    );
  });

  test("refuses a token whose user row is gone as link_broken", async () => {
    const user = await site.factory.user.create({ email: "gone@example.com" });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: user.email,
    });
    const { db } = site.context;
    await db.run(sql`PRAGMA foreign_keys = OFF`);
    await db.delete(users).where(eq(users.id, user.id));
    await db.run(sql`PRAGMA foreign_keys = ON`);

    const page = await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(page.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_error=link_broken",
    );
  });

  test("logs an identity refusal as sign_in_refused", async () => {
    const user = await site.factory.user.create({
      disabledAt: new Date("2026-01-01T00:00:00Z"),
    });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: user.email,
    });

    await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(site.logger.lines.filter((line) => line.level === "warn")).toEqual([
      {
        level: "warn",
        message: "sign_in_refused",
        meta: {
          method: "magic_link",
          code: "account_disabled",
          requestId: expect.any(String) as unknown,
        },
      },
    ]);
  });

  test("refuses an oversized token as token_invalid", async () => {
    const page = await site.visit(
      `/_plumix/auth/magic-link/verify?token=${"x".repeat(512)}`,
      AS_A_LINK,
    );

    expect(page.headers.get("location")).toContain(
      "magic_link_error=token_invalid",
    );
  });

  test("signs in with a token once", async () => {
    const user = await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: "alice@example.com",
    });

    const first = await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(first.headers.get("location")).toBe("/_plumix/admin");
  });

  test("refuses a replayed token as token_invalid", async () => {
    const user = await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: "alice@example.com",
    });
    await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    const replay = await site.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(replay.headers.get("location")).toContain(
      "magic_link_error=token_invalid",
    );
  });

  // The old session stays until its own TTL, matching every other sign-in
  // path and the Copenhagen Book "always create a new session" rule.
  test("mints a fresh session for a user already signed in", async () => {
    const user = await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const { token } = await site.factory.authToken.create({
      userId: user.id,
      email: "alice@example.com",
    });

    const page = await site
      .actingAs(user)
      .visit(`/_plumix/auth/magic-link/verify?token=${token}`, AS_A_LINK);

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/_plumix/admin");
    const rows = await site.context.db.select().from(sessions);
    expect(rows.map((row) => row.userId)).toEqual([user.id, user.id]);
  });

  test("answers 405 to a POST", async () => {
    const page = await site.visit("/_plumix/auth/magic-link/verify", {
      method: "POST",
    });

    expect(page.status).toBe(405);
  });

  test("leaves no magic-link token behind after an unknown one", async () => {
    await site.visit("/_plumix/auth/magic-link/verify?token=zzz", AS_A_LINK);

    const remaining = await site.context.db
      .select()
      .from(authTokens)
      .where(eq(authTokens.type, "magic_link"));
    expect(remaining).toEqual([]);
  });
});

describe("a failed magic link under a theme login page", () => {
  test.each([
    ["missing", "", "missing_token"],
    ["over-long", `?token=${"x".repeat(512)}`, "token_invalid"],
    ["invalid", "?token=not-a-real-token", "token_invalid"],
  ])("lands a %s token on the theme login", async (_name, query, code) => {
    const page = await siteWithThemeLogin.visit(
      `/_plumix/auth/magic-link/verify${query}`,
      AS_A_LINK,
    );

    expect(page.headers.get("location")).toBe(
      `/account/login?magic_link_error=${code}`,
    );
  });

  test("lands an expired token on the theme login", async () => {
    const user = await siteWithThemeLogin.factory.user.create({
      role: "member",
    });
    const { token } = await siteWithThemeLogin.factory.authToken.create({
      userId: user.id,
      email: user.email,
    });
    siteWithThemeLogin.travel({ minutes: 16 });

    const page = await siteWithThemeLogin.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(page.headers.get("location")).toBe(
      "/account/login?magic_link_error=token_expired",
    );
  });

  test("lands a spent token on the theme login", async () => {
    const user = await siteWithThemeLogin.factory.user.create({
      role: "member",
    });
    const { token } = await siteWithThemeLogin.factory.authToken.create({
      userId: user.id,
      email: user.email,
    });
    await siteWithThemeLogin.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    const page = await siteWithThemeLogin.visit(
      `/_plumix/auth/magic-link/verify?token=${token}`,
      AS_A_LINK,
    );

    expect(page.headers.get("location")).toBe(
      "/account/login?magic_link_error=token_invalid",
    );
  });

  test("carries the basePath onto the theme login", async () => {
    const page = await siteWithThemeLoginUnderABasePath.visit(
      "/custom-directory/_plumix/auth/magic-link/verify",
      AS_A_LINK,
    );

    expect(page.headers.get("location")).toBe(
      "/custom-directory/account/login?magic_link_error=missing_token",
    );
  });
});
