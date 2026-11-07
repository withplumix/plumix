import { describe, expect, test } from "vitest";

import { auth } from "../../src/events-and-filters/auth.js";
import { fakeMail } from "../../src/test/mail-fake.js";
import { testSite } from "../../src/test/site.js";

/** Magic link needs a mailer; the site swaps in its own fake for it. */
const site = await testSite({
  plugins: [],
  config: { mailer: fakeMail(), auth: { magicLink: { siteName: "Test" } } },
});

/** A theme that signs users in on its own page. */
const themedSite = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: { magicLink: { siteName: "Test" }, loginPath: "/account/login" },
  },
});

const siteUnderBasePath = await testSite({
  plugins: [],
  config: {
    basePath: "/custom-directory",
    auth: { loginPath: "/account/login" },
  },
});

/** The confirmation link the `emailChange` mail carried. */
function confirmationLink(target: typeof site): string {
  return target.mail.sent("emailChange")[0]?.props.url ?? "";
}

describe("confirming an email change", () => {
  test("commits the new address, emits auth.emailChanged and lands on the login", async () => {
    const user = await site.factory.user.create({
      email: "alice@old.example",
      role: "editor",
    });
    await site.actingAs(user).rpc.user.requestEmailChange({
      id: user.id,
      newEmail: "alice@new.example",
    });

    const page = await site.visit(confirmationLink(site));

    page.assertRedirect("/_plumix/admin/login?email_change_success=1");
    expect(site.events.emitted(auth.emailChanged)).toMatchObject([
      {
        user: { email: "alice@new.example" },
        previousEmail: "alice@old.example",
      },
    ]);
  });

  test("a link without a token lands on the login with missing_token", async () => {
    const page = await site.visit("/_plumix/auth/verify-email");

    page.assertRedirect(
      "/_plumix/admin/login?email_change_error=missing_token",
    );
  });

  test("a token nobody was sent lands on the login with token_invalid", async () => {
    const page = await site.visit("/_plumix/auth/verify-email?token=garbage");

    page.assertRedirect(
      "/_plumix/admin/login?email_change_error=token_invalid",
    );
  });

  test("a method other than GET is not allowed", async () => {
    // Without the X-Plumix-Request header, which `visit` adds, the CSRF gate
    // would refuse it first.
    const page = await site.visit("/_plumix/auth/verify-email?token=x", {
      method: "POST",
    });

    page.assertHeader("allow", "GET").assertSee("Method Not Allowed");
  });
});

describe("confirming an email change on a site with its own login page", () => {
  test("a confirmed change lands on the theme login with email_change_success=1", async () => {
    const user = await themedSite.factory.user.create({
      email: "alice@old.example",
      role: "member",
    });
    await themedSite.actingAs(user).rpc.user.requestEmailChange({
      id: user.id,
      newEmail: "alice@new.example",
    });

    const page = await themedSite.visit(confirmationLink(themedSite));

    page.assertRedirect("/account/login?email_change_success=1");
  });

  test("a failed change lands on the theme login with email_change_error", async () => {
    const page = await themedSite.visit(
      "/_plumix/auth/verify-email?token=garbage",
    );

    page.assertRedirect("/account/login?email_change_error=token_invalid");
  });

  test("under a basePath the theme login carries the base path", async () => {
    const page = await siteUnderBasePath.visit(
      "/custom-directory/_plumix/auth/verify-email",
    );

    page.assertRedirect(
      "/custom-directory/account/login?email_change_error=missing_token",
    );
  });
});
