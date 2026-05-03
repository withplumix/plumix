import { describe, expect, test } from "vitest";

import { and, eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { sessions } from "../../db/schema/sessions.js";
import { users } from "../../db/schema/users.js";
import { userFactory } from "../../test/factories.js";
import { createTestDb } from "../../test/harness.js";
import { makeMailer } from "../../test/mailer.js";
import { hashToken } from "../tokens.js";
import {
  cancelEmailChange,
  EmailChangeError,
  requestEmailChange,
  verifyEmailChange,
} from "./index.js";

const ORIGIN = "https://cms.example";
const SITE_NAME = "Test Site";

describe("requestEmailChange", () => {
  test("persists a hashed token and ships verification email to the new address", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      email: "alice@old.example",
    });
    const mailer = makeMailer();

    const result = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mailer,
      siteName: SITE_NAME,
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

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("alice@new.example");
    expect(mailer.sent[0]?.text).toContain("alice@old.example");
    expect(mailer.sent[0]?.text).toContain("alice@new.example");
    expect(mailer.sent[0]?.text).toContain(ORIGIN);
  });

  test("rejects when the new email matches the current one", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      email: "same@example.test",
    });
    const mailer = makeMailer();

    await expect(
      requestEmailChange(db, {
        userId: user.id,
        newEmail: "same@example.test",
        origin: ORIGIN,
        mailer,
        siteName: SITE_NAME,
      }),
    ).rejects.toThrow(EmailChangeError);
    expect(mailer.sent).toHaveLength(0);
  });

  test("rejects when another user already has the new email", async () => {
    const db = await createTestDb();
    const userA = await userFactory.transient({ db }).create({
      email: "a@example.test",
    });
    await userFactory.transient({ db }).create({ email: "b@example.test" });
    const mailer = makeMailer();

    await expect(
      requestEmailChange(db, {
        userId: userA.id,
        newEmail: "b@example.test",
        origin: ORIGIN,
        mailer,
        siteName: SITE_NAME,
      }),
    ).rejects.toMatchObject({ code: "email_taken" });
  });

  test("rejects on a disabled user", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      email: "alice@example.test",
    });
    await db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, user.id));
    const mailer = makeMailer();

    await expect(
      requestEmailChange(db, {
        userId: user.id,
        newEmail: "alice@new.example",
        origin: ORIGIN,
        mailer,
        siteName: SITE_NAME,
      }),
    ).rejects.toMatchObject({ code: "account_disabled" });
  });

  test("a second request invalidates the first (single in-flight)", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      email: "alice@old.example",
    });
    const mailer = makeMailer();

    const first = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new1.example",
      origin: ORIGIN,
      mailer,
      siteName: SITE_NAME,
    });
    const second = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new2.example",
      origin: ORIGIN,
      mailer,
      siteName: SITE_NAME,
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
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const mailer = makeMailer({ failWith: new Error("smtp down") });
    const warned: unknown[] = [];

    const result = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mailer,
      siteName: SITE_NAME,
      logger: { warn: (msg, meta) => warned.push({ msg, meta }) },
    });

    expect(result.token.length).toBeGreaterThan(0);
    expect(warned).toHaveLength(1);
  });
});

describe("verifyEmailChange", () => {
  test("commits the new email + resets emailVerifiedAt + invalidates sessions", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      email: "alice@old.example",
    });
    // Pre-existing verified state + a session — both should be reset
    // by the email change to require re-auth + re-verification.
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date("2026-01-01") })
      .where(eq(users.id, user.id));
    const { createSession } = await import("../sessions.js");
    await createSession(db, { userId: user.id });
    await createSession(db, { userId: user.id });

    const { token } = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mailer: makeMailer(),
      siteName: SITE_NAME,
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
    const db = await createTestDb();
    await expect(
      verifyEmailChange(db, "not-a-real-token"),
    ).rejects.toMatchObject({ code: "token_invalid" });
  });

  test("returns token_expired past the TTL", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { token } = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mailer: makeMailer(),
      siteName: SITE_NAME,
    });
    await db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) });

    await expect(verifyEmailChange(db, token)).rejects.toMatchObject({
      code: "token_expired",
    });
  });

  test("returns email_taken when the new email got claimed between request and click", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      email: "alice@old.example",
    });
    const { token } = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mailer: makeMailer(),
      siteName: SITE_NAME,
    });
    // Race: another user grabs the target email before the click lands.
    await userFactory.transient({ db }).create({
      email: "alice@new.example",
    });

    await expect(verifyEmailChange(db, token)).rejects.toMatchObject({
      code: "email_taken",
    });
  });

  test("a second verify of the same token is a no-op (single-use)", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { token } = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mailer: makeMailer(),
      siteName: SITE_NAME,
    });
    await verifyEmailChange(db, token);

    await expect(verifyEmailChange(db, token)).rejects.toMatchObject({
      code: "token_invalid",
    });
  });

  test("rejects on a disabled user (account locked between request and verify)", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const { token } = await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mailer: makeMailer(),
      siteName: SITE_NAME,
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
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    await requestEmailChange(db, {
      userId: user.id,
      newEmail: "alice@new.example",
      origin: ORIGIN,
      mailer: makeMailer(),
      siteName: SITE_NAME,
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
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({});
    const result = await cancelEmailChange(db, { userId: user.id });
    expect(result.cancelled).toBe(0);
  });
});
