import { describe, expect, test } from "vitest";

import { eq } from "../../../db/index.js";
import { authTokens } from "../../../db/schema/auth_tokens.js";
import { users } from "../../../db/schema/users.js";
import { createDispatcherHarness } from "../../../test/dispatcher.js";
import { makeMailer } from "../../../test/mailer.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("user.requestEmailChange", () => {
  test("rejects unauthenticated callers", async () => {
    const h = await createRpcHarness();
    await expect(
      h.client.user.requestEmailChange({ id: 1, newEmail: "x@example.test" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("self can request a change for own row", async () => {
    const mailer = makeMailer();
    const h = await createRpcHarness({
      authAs: "editor",
      mailer,
      siteName: "Test",
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
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("new@example.test");
  });

  test("admin can request a change for another user", async () => {
    const mailer = makeMailer();
    const h = await createRpcHarness({
      authAs: "admin",
      mailer,
      siteName: "Test",
    });
    const target = await h.factory.user.create({
      email: "victim@example.test",
    });

    const result = await h.client.user.requestEmailChange({
      id: target.id,
      newEmail: "newvictim@example.test",
    });
    expect(result.ok).toBe(true);
    expect(mailer.sent[0]?.to).toBe("newvictim@example.test");
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
      mailer: makeMailer(),
      siteName: "Test",
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

  test("CONFLICT/email_taken when another user has the target email", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      mailer: makeMailer(),
      siteName: "Test",
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

describe("user.cancelEmailChange", () => {
  test("self cancels their own pending change", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      mailer: makeMailer(),
      siteName: "Test",
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
      mailer: makeMailer(),
      siteName: "Test",
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
      mailer: makeMailer(),
      siteName: "Test",
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
    const mailer = makeMailer();
    const h = await createDispatcherHarness({
      mailer,
      magicLink: { siteName: "Test" },
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
      mailer,
      siteName: "Test",
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
