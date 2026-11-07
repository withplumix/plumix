import { describe, expect, test } from "vitest";

import { eq } from "../../src/db/index.js";
import { authTokens } from "../../src/db/schema/auth_tokens.js";
import { users } from "../../src/db/schema/users.js";
import { auth } from "../../src/hooks/auth.js";
import { fakeMail } from "../../src/test/mail-fake.js";
import { testSite } from "../../src/test/site.js";

/** Magic link needs a mailer; the site swaps in its own fake for it. */
const site = await testSite({
  plugins: [],
  config: { mailer: fakeMail(), auth: { magicLink: { siteName: "Test" } } },
});

/** No magic-link slot, whose mailer and site name an email change reuses. */
const siteWithoutMagicLink = await testSite({ plugins: [] });

/** Its `emailChange` text names the locale the mail rendered in. */
const bilingualSite = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: { magicLink: { siteName: "Test" } },
    i18n: { defaultLocale: "en", locales: ["en", "de"] },
    mail: {
      overrides: {
        emailChange: {
          text: (props, ctx) => `${ctx.locale}: ${props.newEmail}`,
        },
      },
    },
  },
});

describe("requesting an email change", () => {
  test("a visitor is refused", async () => {
    const request = site.rpc.user.requestEmailChange({
      id: 1,
      newEmail: "x@example.test",
    });

    await expect(request).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("a user requests one for their own address, mailed to the new one", async () => {
    const editor = await site.factory.editor.create();

    const result = await site.actingAs(editor).rpc.user.requestEmailChange({
      id: editor.id,
      newEmail: "new@example.test",
    });

    expect(result.ok).toBe(true);
    expect(site.events.emitted(auth.emailChangeRequested)).toMatchObject([
      {
        user: { id: editor.id },
        actor: { id: editor.id },
        newEmail: "new@example.test",
      },
    ]);
    site.mail.assertSent("emailChange", { to: "new@example.test", times: 1 });
  });

  test("an admin requests one for another user, whose address stays until confirmed", async () => {
    const target = await site.factory.user.create({
      email: "victim@example.test",
    });

    const result = await site.actingAs("admin").rpc.user.requestEmailChange({
      id: target.id,
      newEmail: "newvictim@example.test",
    });

    expect(result.ok).toBe(true);
    site.mail.assertSent("emailChange", { to: "newvictim@example.test" });
    expect(
      await site.context.db.query.users.findFirst({
        where: eq(users.id, target.id),
      }),
    ).toMatchObject({ email: "victim@example.test" });
  });

  test("an editor, without user:edit, can't request one for another user", async () => {
    const target = await site.factory.user.create({});

    const request = site.actingAs("editor").rpc.user.requestEmailChange({
      id: target.id,
      newEmail: "x@example.test",
    });

    await expect(request).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:edit" },
    });
  });

  test("an API-token caller is refused, even one scoped to user:edit_own", async () => {
    const editor = await site.factory.user.create({ role: "editor" });
    const { secret } = await site.factory.apiToken.create({
      userId: editor.id,
      name: "scoped",
      scopes: ["user:edit_own"],
    });

    const page = await site.visit("/_plumix/rpc/user/requestEmailChange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        json: { id: editor.id, newEmail: "attacker@example.test" },
      }),
    });

    page.assertJson({ json: { code: "UNAUTHORIZED" } });
    site.mail.assertNothingSent();
  });

  test("an address another user has is a conflict", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.user.create({ email: "taken@example.test" });

    const request = site.actingAs(editor).rpc.user.requestEmailChange({
      id: editor.id,
      newEmail: "taken@example.test",
    });

    await expect(request).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "email_taken" },
    });
  });

  test("a site without magic-link mail is a conflict", async () => {
    const editor = await siteWithoutMagicLink.factory.editor.create();

    const request = siteWithoutMagicLink
      .actingAs(editor)
      .rpc.user.requestEmailChange({
        id: editor.id,
        newEmail: "x@example.test",
      });

    await expect(request).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "mailer_not_configured" },
    });
  });
});

describe("the emailChange mail", () => {
  test("goes to the new address in English, text and HTML", async () => {
    const user = await site.factory.user.create({
      email: "alice@old.example",
      role: "editor",
    });

    await site.actingAs(user).rpc.user.requestEmailChange({
      id: user.id,
      newEmail: "alice@new.example",
    });

    const [sent] = site.mail.sent("emailChange");
    const url = sent?.props.url;
    expect(url).toContain(
      "https://cms.example/_plumix/auth/verify-email?token=",
    );
    expect(sent).toMatchObject({
      to: "alice@new.example",
      subject: "Confirm your new email for Test",
      text: [
        "Someone — hopefully you — asked to change the email on your Test account.",
        "",
        "From: alice@old.example",
        "To:   alice@new.example",
        "",
        "Confirm the change by opening this link:",
        "",
        url,
        "",
        "The link expires in 24 hours.",
        "",
        "If you didn't request this, you can ignore this email — your account stays on alice@old.example.",
      ].join("\n"),
    });
    expect(sent?.html).toContain(`<a href="${url ?? ""}">`);
  });

  test("is in the user's own locale, German here", async () => {
    const user = await bilingualSite.factory.user.create({
      email: "klaus@old.example",
      role: "editor",
      meta: { locale: "de" },
    });

    await bilingualSite.actingAs(user).rpc.user.requestEmailChange({
      id: user.id,
      newEmail: "klaus@new.example",
    });

    expect(bilingualSite.mail.sent("emailChange")).toMatchObject([
      { text: "de: klaus@new.example" },
    ]);
  });
});

describe("cancelling an email change", () => {
  test("a user cancels their own pending change", async () => {
    const editor = await site.factory.editor.create();
    const acting = site.actingAs(editor);
    await acting.rpc.user.requestEmailChange({
      id: editor.id,
      newEmail: "new@example.test",
    });

    const result = await acting.rpc.user.cancelEmailChange({ id: editor.id });

    expect(result.cancelled).toBe(1);
    expect(
      await site.context.db
        .select()
        .from(authTokens)
        .where(eq(authTokens.userId, editor.id)),
    ).toEqual([]);
  });

  test("with no pending change, cancels nothing", async () => {
    const editor = await site.factory.editor.create();

    const result = await site
      .actingAs(editor)
      .rpc.user.cancelEmailChange({ id: editor.id });

    expect(result.cancelled).toBe(0);
  });
});

describe("a user's pending email change", () => {
  test("is null when none was requested", async () => {
    const editor = await site.factory.editor.create();

    const result = await site
      .actingAs(editor)
      .rpc.user.pendingEmailChange({ id: editor.id });

    expect(result).toEqual({ pending: null });
  });

  test("is the requested address and when it expires", async () => {
    site.freezeTime("2026-11-07T10:00:00Z");
    const editor = await site.factory.editor.create();
    const acting = site.actingAs(editor);
    await acting.rpc.user.requestEmailChange({
      id: editor.id,
      newEmail: "new@example.test",
    });

    const result = await acting.rpc.user.pendingEmailChange({ id: editor.id });

    expect(result).toMatchObject({
      pending: {
        newEmail: "new@example.test",
        expiresAt: new Date("2026-11-08T10:00:00Z"),
      },
    });
  });

  test("is null once the request expired, so the admin shows no stale state", async () => {
    const editor = await site.factory.editor.create();
    const acting = site.actingAs(editor);
    await acting.rpc.user.requestEmailChange({
      id: editor.id,
      newEmail: "new@example.test",
    });
    site.travel({ days: 1, minutes: 1 });

    const result = await acting.rpc.user.pendingEmailChange({ id: editor.id });

    expect(result).toEqual({ pending: null });
  });
});
