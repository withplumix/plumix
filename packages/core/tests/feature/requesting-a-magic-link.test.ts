import { describe, expect, test } from "vitest";

import { authTokens } from "../../src/db/schema/auth_tokens.js";
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

/**
 * Its `magicLink` text names the locale the mail rendered in. A test site
 * renders with the stubbed catalogs, so the German text itself is checked in
 * `src/auth/magic-link/request.test.ts`.
 */
const bilingualSite = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: { magicLink: { siteName: "Plumix Test" } },
    i18n: { defaultLocale: "en", locales: ["en", "de"] },
    mail: {
      overrides: {
        magicLink: { text: (_props, ctx) => `in ${ctx.locale}` },
      },
    },
  },
});

/**
 * `site.visit` adds the CSRF header to every `/_plumix/` request unless one is
 * given, so a form post, which carries none, sends it empty.
 */
const NO_CSRF_HEADER = { "x-plumix-request": "" };

function asJson(body: unknown) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  } as const;
}

function asForm(
  fields: Record<string, string>,
  origin = "https://cms.example",
) {
  return {
    method: "POST",
    headers: {
      ...NO_CSRF_HEADER,
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
    body: new URLSearchParams(fields).toString(),
  } as const;
}

describe("requesting a magic link", () => {
  test("answers 503 when magic links are not configured", async () => {
    const page = await siteWithoutMagicLink.visit(
      "/_plumix/auth/magic-link/request",
      asJson({ email: "x@y.z" }),
    );

    expect(page.status).toBe(503);
  });

  test("answers the generic notice to a registered user", async () => {
    await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });

    const page = await site.visit(
      "/_plumix/auth/magic-link/request",
      asJson({ email: "alice@example.com" }),
    );

    page.assertOk();
    expect(JSON.parse(page.body)).toMatchObject({
      ok: true,
      message: expect.stringMatching(/account exists/i) as unknown,
    });
  });

  test("mails a registered user a verify link", async () => {
    await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });

    await site.visit(
      "/_plumix/auth/magic-link/request",
      asJson({ email: "alice@example.com" }),
    );

    const sent = site.mail.sent("magicLink");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain(
      "https://cms.example/_plumix/auth/magic-link/verify?token=",
    );
  });

  test("sends core's magicLink mail, text and HTML, in English", async () => {
    await site.factory.user.create({ email: "alice@example.com" });

    await site.visit(
      "/_plumix/auth/magic-link/request",
      asJson({ email: "alice@example.com" }),
    );

    const [sent] = site.mail.sent("magicLink");
    const url = sent?.props.url;
    expect(sent).toMatchObject({
      to: "alice@example.com",
      subject: "Sign in to Plumix Test",
      text: [
        "Sign in to Plumix Test by opening this link:",
        "",
        url,
        "",
        "The link expires in 15 minutes.",
        "",
        "If you didn't request this, you can ignore this email.",
      ].join("\n"),
    });
    expect(sent?.html).toContain(`<a href="${url ?? ""}">`);
    expect(sent?.html).toContain("The link expires in 15 minutes.");
  });

  test("is in the user's own locale, German here", async () => {
    await bilingualSite.factory.user.create({
      email: "klaus@example.com",
      meta: { locale: "de" },
    });

    await bilingualSite.visit(
      "/_plumix/auth/magic-link/request",
      asJson({ email: "klaus@example.com" }),
    );

    expect(bilingualSite.mail.sent("magicLink")).toMatchObject([
      { text: "in de" },
    ]);
  });

  test("is in the request's locale for a user with none stored", async () => {
    await bilingualSite.factory.user.create({
      email: "klaus@example.com",
      role: "editor",
    });

    await bilingualSite.visit(
      "/_plumix/auth/magic-link/request?lang=de",
      asJson({ email: "klaus@example.com" }),
    );

    expect(bilingualSite.mail.sent("magicLink")).toMatchObject([
      { text: "in de" },
    ]);
  });

  test("falls back to English when the request's locale is unknown", async () => {
    await bilingualSite.factory.user.create({
      email: "fallback@example.com",
      role: "editor",
    });

    await bilingualSite.visit(
      "/_plumix/auth/magic-link/request?lang=xx-INVALID",
      asJson({ email: "fallback@example.com" }),
    );

    expect(bilingualSite.mail.sent("magicLink")).toMatchObject([
      { subject: "Sign in to Plumix Test", text: "in en" },
    ]);
  });

  test("puts the configured basePath in the emailed verify link", async () => {
    await siteUnderABasePath.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });

    // `site.visit` adds the CSRF header only under `/_plumix/`.
    const page = await siteUnderABasePath.visit(
      "/custom-directory/_plumix/auth/magic-link/request",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-plumix-request": "1",
        },
        body: JSON.stringify({ email: "alice@example.com" }),
      },
    );

    page.assertOk();
    expect(siteUnderABasePath.mail.sent("magicLink")[0]?.text).toContain(
      "https://cms.example/custom-directory/_plumix/auth/magic-link/verify?token=",
    );
  });

  test("folds a safe redirectTo into the emailed verify link", async () => {
    await site.factory.user.create({
      email: "alice@example.com",
      role: "member",
    });

    const page = await site.visit(
      "/_plumix/auth/magic-link/request",
      asJson({ email: "alice@example.com", redirectTo: "/account/saved" }),
    );

    page.assertOk();
    expect(site.mail.sent("magicLink")[0]?.text).toMatch(
      /[?&]redirectTo=%2Faccount%2Fsaved/,
    );
  });

  test("puts the site root in the emailed link for an unsafe redirectTo", async () => {
    await site.factory.user.create({
      email: "alice@example.com",
      role: "member",
    });

    await site.visit(
      "/_plumix/auth/magic-link/request",
      asJson({ email: "alice@example.com", redirectTo: "https://evil.com" }),
    );

    const url = new URL(site.mail.sent("magicLink")[0]?.props.url ?? "");
    expect(url.searchParams.get("redirectTo")).toBe("/");
  });

  test("is callable from a theme page on the site's own origin", async () => {
    await site.factory.user.create({
      email: "alice@example.com",
      role: "member",
    });

    const page = await site.visit("/_plumix/auth/magic-link/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://cms.example",
      },
      body: JSON.stringify({
        email: "alice@example.com",
        redirectTo: "/account",
      }),
    });

    page.assertOk();
    const sent = site.mail.sent("magicLink");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toMatch(/[?&]redirectTo=%2Faccount/);
  });

  test("answers the same notice for an unregistered email", async () => {
    const page = await site.visit(
      "/_plumix/auth/magic-link/request",
      asJson({ email: "stranger@example.com" }),
    );

    page.assertOk();
    expect(JSON.parse(page.body)).toMatchObject({
      ok: true,
      message: expect.stringMatching(/account exists/i) as unknown,
    });
  });

  test("mails nothing for an unregistered email", async () => {
    await site.visit(
      "/_plumix/auth/magic-link/request",
      asJson({ email: "stranger@example.com" }),
    );

    site.mail.assertNothingSent();
  });

  test("answers 400 to a malformed email", async () => {
    const page = await site.visit(
      "/_plumix/auth/magic-link/request",
      asJson({ email: "not-an-email" }),
    );

    expect(page.status).toBe(400);
  });

  test("is refused without the CSRF header", async () => {
    const page = await site.visit("/_plumix/auth/magic-link/request", {
      method: "POST",
      headers: { ...NO_CSRF_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ email: "x@y.z" }),
    });

    page.assertForbidden();
  });

  test("answers 400 invalid_input to a fetch with a malformed body", async () => {
    const page = await site.visit("/_plumix/auth/magic-link/request", {
      method: "POST",
      body: "{",
    });

    expect(page.status).toBe(400);
    expect(JSON.parse(page.body)).toEqual({ error: "invalid_input" });
  });

  test("issues nothing for an unlisted email without self-signup", async () => {
    await site.factory.user.create({ role: "admin" });

    const page = await site.visit(
      "/_plumix/auth/magic-link/request",
      asJson({ email: "visitor@anywhere.test" }),
    );

    page.assertOk();
    site.mail.assertNothingSent();
    expect(await site.context.db.select().from(authTokens)).toEqual([]);
  });
});

describe("requesting a magic link from a plain form", () => {
  test("lands on ?magic_link_sent=1", async () => {
    await site.factory.user.create({ email: "alice@example.com" });

    const page = await site.visit(
      "/_plumix/auth/magic-link/request",
      asForm({ email: "alice@example.com" }),
    );

    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_sent=1",
    );
  });

  test("sends the link", async () => {
    await site.factory.user.create({ email: "alice@example.com" });

    await site.visit(
      "/_plumix/auth/magic-link/request",
      asForm({ email: "alice@example.com" }),
    );

    site.mail.assertSent("magicLink", { to: "alice@example.com", times: 1 });
  });

  test("lands on ?magic_link_error=invalid_input for a malformed email", async () => {
    const page = await site.visit(
      "/_plumix/auth/magic-link/request",
      asForm({ email: "not-an-email" }),
    );

    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe(
      "/_plumix/admin/login?magic_link_error=invalid_input",
    );
  });

  test("is refused as csrf_origin_mismatch from another origin", async () => {
    const page = await site.visit(
      "/_plumix/auth/magic-link/request",
      asForm({ email: "alice@example.com" }, "https://evil.example"),
    );

    page.assertForbidden();
    expect(JSON.parse(page.body)).toEqual({
      error: "forbidden",
      reason: "csrf_origin_mismatch",
    });
  });

  test("carries its redirectTo field into the emailed link", async () => {
    await site.factory.user.create({ email: "alice@example.com" });

    await site.visit(
      "/_plumix/auth/magic-link/request",
      asForm({ email: "alice@example.com", redirectTo: "/account" }),
    );

    const url = new URL(site.mail.sent("magicLink")[0]?.props.url ?? "");
    expect(url.searchParams.get("redirectTo")).toBe("/account");
  });
});
