import { describe, expect, test } from "vitest";

import type { MailSender } from "../../mail/contract/registry.js";
import { and, eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { sessions } from "../../db/schema/sessions.js";
import { users } from "../../db/schema/users.js";
import { fakeMail } from "../../test/mail-fake.js";
import { testSite } from "../../test/site.js";
import { createSession } from "../sessions.js";
import { hashToken } from "../tokens.js";
import {
  cancelEmailChange,
  EmailChangeError,
  requestEmailChange,
  verifyEmailChange,
} from "./index.js";

const ORIGIN = "https://cms.example";
const SITE_NAME = "Test Site";

/** Magic link needs a mailer; the site swaps in its own fake for it. */
const site = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: { magicLink: { siteName: SITE_NAME } },
  },
});

describe("requestEmailChange", () => {
  test("persists a hashed token and ships verification email to the new address", async () => {
    const { db } = site.context;
    const user = await site.factory.user.create({
      email: "alice@old.example",
    });

    const result = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mail: site.context.mail,
    });

    expect(result.token.length).toBeGreaterThan(20);
    expect(result.user.id).toBe(user.id);

    const stored = await db
      .select()
      .from(authTokens)
      .where(
        and(
          eq(authTokens.type, "email_verification"),
          eq(authTokens.userId, user.id),
        ),
      )
      .get();
    // Hashed at rest — the row's PK is SHA-256 of the raw token.
    expect(stored?.hash).toBe(await hashToken(result.token));
    expect(stored?.email).toBe("alice@new.example");

    site.mail.assertSent("emailChange", { to: "alice@new.example", times: 1 });
    const [sent] = site.mail.sent("emailChange");
    expect(sent?.text).toContain("alice@old.example");
    expect(sent?.text).toContain("alice@new.example");
    expect(sent?.text).toContain(ORIGIN);
  });

  test("rejects when the new email matches the current one", async () => {
    const { db } = site.context;
    const user = await site.factory.user.create({
      email: "same@example.test",
    });

    await expect(
      requestEmailChange(db, {
        userId: user.id,
        newEmail: "same@example.test",
        origin: ORIGIN,
        mail: site.context.mail,
      }),
    ).rejects.toThrow(EmailChangeError);
    site.mail.assertNothingSent();
  });

  test("rejects when another user already has the new email", async () => {
    const { db } = site.context;
    const userA = await site.factory.user.create({
      email: "a@example.test",
    });
    await site.factory.user.create({ email: "b@example.test" });

    await expect(
      requestEmailChange(db, {
        userId: userA.id,
        newEmail: "b@example.test",
        origin: ORIGIN,
        mail: site.context.mail,
      }),
    ).rejects.toMatchObject({ code: "email_taken" });
  });

  test("rejects on a disabled user", async () => {
    const { db } = site.context;
    const user = await site.factory.user.create({
      email: "alice@example.test",
      disabledAt: new Date(),
    });

    await expect(
      requestEmailChange(db, {
        userId: user.id,
        newEmail: "alice@new.example",
        origin: ORIGIN,
        mail: site.context.mail,
      }),
    ).rejects.toMatchObject({ code: "account_disabled" });
  });

  test("a second request invalidates the first (single in-flight)", async () => {
    const { db } = site.context;
    const user = await site.factory.user.create({
      email: "alice@old.example",
    });

    const first = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new1.example",
      origin: ORIGIN,
      mail: site.context.mail,
    });
    const second = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new2.example",
      origin: ORIGIN,
      mail: site.context.mail,
    });

    // The first link no longer verifies — the row was purged before
    // the second insert.
    await expect(verifyEmailChange(db, first.token)).rejects.toMatchObject({
      code: "token_invalid",
    });

    // The second one still works.
    const verified = await verifyEmailChange(db, second.token);
    expect(verified.user.email).toBe("alice@new2.example");
  });

  test("swallows mailer transport failures (still persists the token)", async () => {
    const { db } = site.context;
    const user = await site.factory.user.create({});
    const failing: MailSender = {
      send: () => Promise.reject(new Error("smtp down")),
    };

    const result = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mail: failing,
      logger: site.context.logger,
    });

    expect(result.token.length).toBeGreaterThan(0);
    site.logger.assertLogged("warn", "email_change_mailer_failed");
    expect(site.logger.lines.filter((l) => l.level === "warn")).toHaveLength(1);
  });
});

describe("verifyEmailChange", () => {
  test("commits the new email + resets emailVerifiedAt + invalidates sessions", async () => {
    const { db } = site.context;
    // Pre-existing verified state + a session — both should be reset
    // by the email change to require re-auth + re-verification.
    const user = await site.factory.user.create({
      email: "alice@old.example",
      emailVerifiedAt: new Date("2026-01-01"),
    });
    await createSession(db, { userId: user.id });
    await createSession(db, { userId: user.id });

    const { token } = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mail: site.context.mail,
    });

    const result = await verifyEmailChange(db, token);

    expect(result.previousEmail).toBe("alice@old.example");
    expect(result.user.email).toBe("alice@new.example");
    expect(result.user.emailVerifiedAt).not.toBeNull();
    // The reset is to NOW — not the prior 2026-01-01 timestamp.
    expect(result.user.emailVerifiedAt?.getTime()).toBeGreaterThan(
      new Date("2026-01-01").getTime(),
    );

    // Sessions for this user are gone.
    const remaining = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(remaining).toHaveLength(0);

    // Token row was consumed.
    const tokenRow = await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.userId, user.id))
      .get();
    expect(tokenRow).toBeUndefined();
  });

  test("returns token_invalid for an unknown token", async () => {
    const { db } = site.context;
    await expect(
      verifyEmailChange(db, "not-a-real-token"),
    ).rejects.toMatchObject({ code: "token_invalid" });
  });

  test("returns token_expired past the TTL", async () => {
    const { db } = site.context;
    const user = await site.factory.user.create({});
    // request always mints a live token; seed the expired state directly.
    const { token } = await site.factory.authToken.create({
      type: "email_verification",
      userId: user.id,
      email: "alice@new.example",
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(verifyEmailChange(db, token)).rejects.toMatchObject({
      code: "token_expired",
    });
  });

  test("returns email_taken when the new email got claimed between request and click", async () => {
    const { db } = site.context;
    const user = await site.factory.user.create({
      email: "alice@old.example",
    });
    const { token } = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mail: site.context.mail,
    });
    // Race: another user grabs the target email before the click lands.
    await site.factory.user.create({
      email: "alice@new.example",
    });

    await expect(verifyEmailChange(db, token)).rejects.toMatchObject({
      code: "email_taken",
    });
  });

  test("a second verify of the same token is a no-op (single-use)", async () => {
    const { db } = site.context;
    const user = await site.factory.user.create({});
    const { token } = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mail: site.context.mail,
    });
    await verifyEmailChange(db, token);

    await expect(verifyEmailChange(db, token)).rejects.toMatchObject({
      code: "token_invalid",
    });
  });

  test("rejects on a disabled user (account locked between request and verify)", async () => {
    const { db } = site.context;
    const user = await site.factory.user.create({});
    const { token } = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mail: site.context.mail,
    });
    await db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, user.id));

    await expect(verifyEmailChange(db, token)).rejects.toMatchObject({
      code: "account_disabled",
    });
  });
});

describe("cancelEmailChange", () => {
  test("removes the outstanding token and reports the count", async () => {
    const { db } = site.context;
    const user = await site.factory.user.create({});
    await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mail: site.context.mail,
    });

    const result = await cancelEmailChange(db, { userId: user.id });
    expect(result.cancelled).toBe(1);

    const row = await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.userId, user.id))
      .get();
    expect(row).toBeUndefined();
  });

  test("idempotent: cancel without a pending request returns 0", async () => {
    const { db } = site.context;
    const user = await site.factory.user.create({});
    const result = await cancelEmailChange(db, { userId: user.id });
    expect(result.cancelled).toBe(0);
  });
});
