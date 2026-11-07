import { describe, expect, test } from "vitest";

import { eq } from "../../src/db/index.js";
import { authTokens } from "../../src/db/schema/auth_tokens.js";
import { sessions } from "../../src/db/schema/sessions.js";
import { users } from "../../src/db/schema/users.js";
import { auth } from "../../src/events-and-filters/auth.js";
import { definePlugin } from "../../src/plugin/define.js";
import { text } from "../../src/plugin/fields/index.js";
import { fakeMail } from "../../src/test/mail-fake.js";
import { testSite } from "../../src/test/site.js";

/** Signs up whoever has an address on example.com, as an editor. */
const site = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: {
      magicLink: { siteName: "Plumix Test" },
      allowedDomains: { "example.com": "editor" },
    },
  },
});

/** Also signs up every other address, as a member. */
const openSite = await testSite({
  plugins: [
    definePlugin("profiles", {
      setup: (ctx) => {
        ctx.registerUserMetaBox("profile", {
          label: "Profile",
          fields: [text("pronouns").default("they/them"), text("bio")],
        });
      },
    }),
  ],
  config: {
    mailer: fakeMail(),
    auth: {
      magicLink: { siteName: "Plumix Test" },
      allowedDomains: { "example.com": "editor" },
      selfSignup: { defaultRole: "member" },
    },
  },
});

/** Lets a magic link mint the first user. */
const bootstrapSite = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: {
      magicLink: { siteName: "Plumix Test" },
      allowedDomains: { "example.com": "editor" },
      bootstrapVia: "first-method-wins",
    },
  },
});

/** The site with no allowed domain and no self-signup. */
const closedSite = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: { magicLink: { siteName: "Plumix Test" } },
  },
});

type Site = typeof site;

/**
 * A click on the emailed link carries no CSRF header, so the route answers
 * with a redirect, not a fetch's JSON.
 */
const AS_A_LINK = { headers: { "x-plumix-request": "" } };

function requestLink(on: Site, email: string) {
  return on.visit("/_plumix/auth/magic-link/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

/** Clicks a link issued to an address no user had when it was sent. */
async function clickLinkIssuedTo(on: Site, email: string) {
  const { token } = await on.factory.authToken.create({ userId: null, email });
  return on.visit(`/_plumix/auth/magic-link/verify?token=${token}`, AS_A_LINK);
}

function userWithEmail(on: Site, email: string) {
  return on.context.db.query.users.findFirst({
    where: eq(users.email, email),
  });
}

describe("signing up through the emailed link", () => {
  test("signs a listed domain's newcomer in and lands on the admin", async () => {
    await site.factory.user.create({ role: "admin" });
    await requestLink(site, "ann@example.com");
    const verifyUrl = site.mail.sent("magicLink")[0]?.props.url ?? "";

    const page = await site.visit(verifyUrl, AS_A_LINK);

    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/_plumix/admin");
    expect(page.headers.get("set-cookie")).toContain("plumix_session=");
  });

  test("provisions the newcomer at the domain's role, email verified, with a session", async () => {
    await site.factory.user.create({ role: "admin" });
    await requestLink(site, "ann@example.com");
    const verifyUrl = site.mail.sent("magicLink")[0]?.props.url ?? "";

    await site.visit(verifyUrl, AS_A_LINK);

    const created = await userWithEmail(site, "ann@example.com");
    expect(created?.role).toBe("editor");
    expect(created?.emailVerifiedAt).not.toBeNull();
    const rows = await site.context.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, created?.id ?? 0));
    expect(rows).toHaveLength(1);
  });

  test("registers an unlisted address at the self-signup role", async () => {
    await openSite.factory.user.create({ role: "admin" });
    await requestLink(openSite, "visitor@anywhere.test");
    const verifyUrl = openSite.mail.sent("magicLink")[0]?.props.url ?? "";

    const page = await openSite.visit(verifyUrl, AS_A_LINK);

    expect(page.status).toBe(302);
    expect(page.headers.get("set-cookie")).toContain("plumix_session=");
    const created = await userWithEmail(openSite, "visitor@anywhere.test");
    expect(created?.role).toBe("member");
    expect(created?.emailVerifiedAt).not.toBeNull();
  });

  test("stores the user fields' defaults on the new user", async () => {
    await openSite.factory.user.create({ role: "admin" });
    await requestLink(openSite, "visitor@anywhere.test");
    const verifyUrl = openSite.mail.sent("magicLink")[0]?.props.url ?? "";

    await openSite.visit(verifyUrl, AS_A_LINK);

    const created = await userWithEmail(openSite, "visitor@anywhere.test");
    expect(created?.meta).toEqual({ pronouns: "they/them" });
  });

  test("issues nothing to an unlisted address without self-signup", async () => {
    await closedSite.factory.user.create({ role: "admin" });

    const page = await requestLink(closedSite, "visitor@anywhere.test");

    page.assertOk();
    closedSite.mail.assertNothingSent();
    const tokens = await closedSite.context.db.select().from(authTokens);
    expect(tokens).toHaveLength(0);
  });
});

describe("verifying a link issued to a new address", () => {
  test("provisions a user with the domain's role, email verified", async () => {
    await site.factory.user.create({ role: "admin" });

    await clickLinkIssuedTo(site, "ann@example.com");

    const created = await userWithEmail(site, "ann@example.com");
    expect(created?.role).toBe("editor");
    expect(created?.emailVerifiedAt).not.toBeNull();
  });

  test("matches the domain whatever its case", async () => {
    await site.factory.user.create({ role: "admin" });

    await clickLinkIssuedTo(site, "ANN@Example.COM");

    const created = await userWithEmail(site, "ANN@Example.COM");
    expect(created?.role).toBe("editor");
  });

  test("keeps a listed domain's own role under self-signup", async () => {
    await openSite.factory.user.create({ role: "admin" });

    await clickLinkIssuedTo(openSite, "ann@example.com");

    const ann = await userWithEmail(openSite, "ann@example.com");
    expect(ann?.role).toBe("editor");
  });

  test("gives an unlisted domain the default role under self-signup", async () => {
    await openSite.factory.user.create({ role: "admin" });

    await clickLinkIssuedTo(openSite, "bob@other.com");

    const bob = await userWithEmail(openSite, "bob@other.com");
    expect(bob?.role).toBe("member");
  });

  test("refuses an address on an unlisted domain without self-signup", async () => {
    await site.factory.user.create({ role: "admin" });

    const page = await clickLinkIssuedTo(site, "bob@other.com");

    expect(page.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_error=domain_not_allowed",
    );
  });

  test("is refused as registration_closed when the site has no users", async () => {
    const page = await clickLinkIssuedTo(site, "newcomer@example.com");

    expect(page.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_error=registration_closed",
    );
  });

  test("mints the first admin under bootstrapVia first-method-wins", async () => {
    await clickLinkIssuedTo(bootstrapSite, "first@example.com");

    const created = await userWithEmail(bootstrapSite, "first@example.com");
    expect(created?.role).toBe("admin");
  });

  test("signs into a user who took the address while the link was pending", async () => {
    await site.factory.user.create({ role: "admin" });
    const raced = await site.factory.user.create({
      email: "newcomer@example.com",
      role: "member",
    });

    await clickLinkIssuedTo(site, "newcomer@example.com");

    site.events.assertEmitted(auth.signedIn, {
      user: { id: raced.id },
      method: "magic_link",
      firstSignIn: false,
    });
  });

  test("is refused when the user who took the address is disabled", async () => {
    await site.factory.user.create({ role: "admin" });
    await site.factory.user.create({
      email: "newcomer@example.com",
      disabledAt: new Date("2026-01-01T00:00:00Z"),
    });

    const page = await clickLinkIssuedTo(site, "newcomer@example.com");

    expect(page.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_error=account_disabled",
    );
  });
});
