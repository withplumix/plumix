import { describe, expect, test } from "vitest";

import { createApiToken } from "../../../auth/api-tokens.js";
import { eq } from "../../../db/index.js";
import { authTokens } from "../../../db/schema/auth_tokens.js";
import { users } from "../../../db/schema/users.js";
import { createTestContext } from "../../../test/context.js";
import { createDispatcherHarness } from "../../../test/dispatcher.js";
import { poCatalogs } from "../../../test/po-catalog.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("user.requestEmailChange", () => {
  test("rejects unauthenticated callers", async () => {
    const h = await createRpcHarness();
    await expect(
      h.client.user.requestEmailChange({ id: 1, newEmail: "x@example.test" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("self can request a change for own row", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      config: { auth: { magicLink: { siteName: "Test" } } },
    });
    const spy = h.spyAction("user:email_change_requested");

    const result = await h.client.user.requestEmailChange({
      id: h.user.id,
      newEmail: "new@example.test",
    });
    expect(result.ok).toBe(true);

    spy.assertCalledOnce();
    const [user, ctx] = spy.lastArgs ?? [];
    expect(user?.id).toBe(h.user.id);
    expect(ctx?.actor.id).toBe(h.user.id);
    expect(ctx?.newEmail).toBe("new@example.test");
    h.mail.assertSent("emailChange", { to: "new@example.test", times: 1 });
  });

  test("admin can request a change for another user", async () => {
    const h = await createRpcHarness({
      authAs: "admin",
      config: { auth: { magicLink: { siteName: "Test" } } },
    });
    const target = await h.factory.user.create({
      email: "victim@example.test",
    });

    const result = await h.client.user.requestEmailChange({
      id: target.id,
      newEmail: "newvictim@example.test",
    });
    expect(result.ok).toBe(true);
    h.mail.assertSent("emailChange", { to: "newvictim@example.test" });
    // The target's row email is NOT yet changed — verify-time commits.
    const row = await h.db
      .select()
      .from(users)
      .where(eq(users.id, target.id))
      .get();
    expect(row?.email).toBe("victim@example.test");
  });

  test("editor (no user:edit cap) cannot request change for another user", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      config: { auth: { magicLink: { siteName: "Test" } } },
    });
    const target = await h.factory.user.create({});

    await expect(
      h.client.user.requestEmailChange({
        id: target.id,
        newEmail: "x@example.test",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:edit" },
    });
  });

  test("refuses an API-token caller, even one scoped to user:edit_own", async () => {
    const request = new Request("https://cms.example/_plumix/rpc", {
      method: "POST",
    });
    const h = await createRpcHarness({
      request,
      config: { auth: { magicLink: { siteName: "Test" } } },
    });
    const user = await h.factory.user.create({ role: "editor" });
    const { secret } = await createApiToken(h.db, {
      userId: user.id,
      name: "scoped",
      expiresAt: null,
      scopes: ["user:edit_own"],
    });
    request.headers.set("authorization", `Bearer ${secret}`);

    await expect(
      h.client.user.requestEmailChange({
        id: user.id,
        newEmail: "attacker@example.test",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    h.mail.assertNothingSent();
  });

  test("CONFLICT/email_taken when another user has the target email", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      config: { auth: { magicLink: { siteName: "Test" } } },
    });
    await h.factory.user.create({ email: "taken@example.test" });

    await expect(
      h.client.user.requestEmailChange({
        id: h.user.id,
        newEmail: "taken@example.test",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "email_taken" },
    });
  });

  test("CONFLICT/mailer_not_configured when magicLink/mailer config is missing", async () => {
    // No mailer or siteName passed — both are required for email change.
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(
      h.client.user.requestEmailChange({
        id: h.user.id,
        newEmail: "x@example.test",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "mailer_not_configured" },
    });
  });
});

describe("the emailChange mail", () => {
  test("goes to the new address in English, text and HTML", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Test" } } },
    });
    const user = await h.factory.user.create({
      email: "alice@old.example",
      role: "editor",
    });

    const response = await h.fetch("/_plumix/rpc/user/requestEmailChange", {
      as: user,
      json: { json: { id: user.id, newEmail: "alice@new.example" } },
    });

    response.assertStatus(200);
    const [sent] = h.mail.sent("emailChange");
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
    const h = await createDispatcherHarness({
      config: {
        auth: { magicLink: { siteName: "Test" } },
        i18n: { defaultLocale: "en", locales: ["en", "de"] },
      },
      // Core's own catalog, which unit tests otherwise resolve to empty.
      pluginCatalogs: poCatalogs({
        de: new URL("../../../../locales/mail-de.po", import.meta.url),
      }),
    });
    const user = await h.factory.user.create({
      email: "klaus@old.example",
      role: "editor",
      meta: { locale: "de" },
    });

    await h.fetch("/_plumix/rpc/user/requestEmailChange", {
      as: user,
      json: { json: { id: user.id, newEmail: "klaus@new.example" } },
    });

    const [sent] = h.mail.sent("emailChange");
    expect(sent?.subject).toBe("Bestätigen Sie Ihre neue E-Mail für Test");
    expect(sent?.text).toContain("Von: klaus@old.example");
    expect(sent?.text).toContain("Der Link läuft in 24 Stunden ab.");
    expect(sent?.html).toContain(
      "Bestätigen Sie die Änderung über diesen Link:",
    );
  });
});

describe("user.cancelEmailChange", () => {
  test("self cancels their own pending change", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      config: { auth: { magicLink: { siteName: "Test" } } },
    });
    await h.client.user.requestEmailChange({
      id: h.user.id,
      newEmail: "new@example.test",
    });

    const result = await h.client.user.cancelEmailChange({ id: h.user.id });
    expect(result.cancelled).toBe(1);

    const row = await h.db
      .select()
      .from(authTokens)
      .where(eq(authTokens.userId, h.user.id))
      .get();
    expect(row).toBeUndefined();
  });

  test("idempotent: 0 cancelled when no pending request", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const result = await h.client.user.cancelEmailChange({ id: h.user.id });
    expect(result.cancelled).toBe(0);
  });
});

describe("user.pendingEmailChange", () => {
  test("returns null when no pending request", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const result = await h.client.user.pendingEmailChange({ id: h.user.id });
    expect(result).toEqual({ pending: null });
  });

  test("returns the pending newEmail + expiresAt", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      config: { auth: { magicLink: { siteName: "Test" } } },
    });
    await h.client.user.requestEmailChange({
      id: h.user.id,
      newEmail: "new@example.test",
    });

    const result = await h.client.user.pendingEmailChange({ id: h.user.id });
    expect(result.pending?.newEmail).toBe("new@example.test");
    expect(result.pending?.expiresAt).toBeInstanceOf(Date);
  });

  test("returns null for an expired pending row (UI doesn't show stale state)", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      config: { auth: { magicLink: { siteName: "Test" } } },
    });
    await h.client.user.requestEmailChange({
      id: h.user.id,
      newEmail: "new@example.test",
    });
    await h.db
      .update(authTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    const result = await h.client.user.pendingEmailChange({ id: h.user.id });
    expect(result).toEqual({ pending: null });
  });
});

describe("GET /_plumix/auth/verify-email", () => {
  test("happy path: redirects to login?email_change_success=1 + commits + emits hook", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Test" } } },
    });
    const seeded = await h.factory.user.create({
      email: "alice@old.example",
      role: "editor",
    });
    const spyChanged = h.spyAction("user:email_changed");

    // Use the primitive directly to mint a verification token, since
    // there's no harness shortcut for "as user X submit RPC".
    const { requestEmailChange } =
      await import("../../../auth/email-change/index.js");
    const { token } = await requestEmailChange(h.db, {
      userId: seeded.id,
      newEmail: "alice@new.example",
      origin: "https://cms.example",
      mail: createTestContext({
        db: h.db,
        config: { mailer: h.mail, auth: { magicLink: { siteName: "Test" } } },
      }).mail,
    });

    const response = await h.dispatch(
      new Request(
        `https://cms.example/_plumix/auth/verify-email?token=${token}`,
        {
          method: "GET",
        },
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "email_change_success=1",
    );

    spyChanged.assertCalledOnce();
    const [user, ctx] = spyChanged.lastArgs ?? [];
    expect(user?.email).toBe("alice@new.example");
    expect(ctx?.previousEmail).toBe("alice@old.example");
  });

  test("missing-token redirects to login with email_change_error=missing_token", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/verify-email", {
        method: "GET",
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "email_change_error=missing_token",
    );
  });

  test("invalid token redirects with token_invalid", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      new Request(
        "https://cms.example/_plumix/auth/verify-email?token=garbage",
        { method: "GET" },
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "email_change_error=token_invalid",
    );
  });

  test("non-GET method with CSRF header returns 405", async () => {
    // POST without the X-Plumix-Request header would 403 at the
    // CSRF gate; with it, the method-not-allowed gate fires.
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      new Request("https://cms.example/_plumix/auth/verify-email?token=x", {
        method: "POST",
        headers: { "x-plumix-request": "1" },
      }),
    );
    expect(response.status).toBe(405);
  });
});

describe("GET /_plumix/auth/verify-email lands on auth.loginPath", () => {
  test("a confirmed change redirects to the theme login with email_change_success=1", async () => {
    const h = await createDispatcherHarness({
      config: {
        auth: {
          magicLink: { siteName: "Test" },
          loginPath: "/account/login",
        },
      },
    });
    const seeded = await h.factory.user.create({
      email: "alice@old.example",
      role: "subscriber",
    });
    const { requestEmailChange } =
      await import("../../../auth/email-change/index.js");
    const { token } = await requestEmailChange(h.db, {
      userId: seeded.id,
      newEmail: "alice@new.example",
      origin: "https://cms.example",
      mail: createTestContext({
        db: h.db,
        config: { mailer: h.mail, auth: { magicLink: { siteName: "Test" } } },
      }).mail,
    });

    const response = await h.dispatch(
      new Request(
        `https://cms.example/_plumix/auth/verify-email?token=${token}`,
      ),
    );
    expect(response.headers.get("location")).toBe(
      "/account/login?email_change_success=1",
    );
  });

  test("a failed change redirects to the theme login with email_change_error", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { loginPath: "/account/login" } },
    });
    const response = await h.dispatch(
      new Request(
        "https://cms.example/_plumix/auth/verify-email?token=garbage",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "/account/login?email_change_error=token_invalid",
    );
  });

  test("under a basePath the theme login carries the base path", async () => {
    const h = await createDispatcherHarness({
      config: {
        basePath: "/custom-directory",
        auth: { loginPath: "/account/login" },
      },
    });
    const response = await h.dispatch(
      new Request(
        "https://cms.example/custom-directory/_plumix/auth/verify-email",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "/custom-directory/account/login?email_change_error=missing_token",
    );
  });
});
