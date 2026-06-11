import { describe, expect, test } from "vitest";

import { eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
import {
  allowedDomainFactory,
  authTokenFactory,
  userFactory,
} from "../../test/factories.js";
import { createTestDb } from "../../test/harness.js";
import { MagicLinkError } from "./errors.js";
import { verifyMagicLink } from "./verify.js";

describe("verifyMagicLink", () => {
  test("returns the user and deletes the row on success", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });
    const token = (
      await authTokenFactory
        .transient({ db })
        .create({ userId: user.id, email: "alice@example.com" })
    ).token;

    const result = await verifyMagicLink(db, token);
    expect(result.user.id).toBe(user.id);
    expect(result.created).toBe(false);

    // Row gone — replay rejects.
    const remaining = await db.select().from(authTokens);
    expect(remaining).toHaveLength(0);
  });

  test("rejects an unknown token with token_invalid", async () => {
    const db = await createTestDb();
    await expect(
      verifyMagicLink(db, "definitely-not-a-token"),
    ).rejects.toMatchObject({ code: "token_invalid" });
  });

  test("rejects an expired token with token_expired (and removes the row)", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      role: "editor",
      email: "x@y.z",
    });
    const token = (
      await authTokenFactory.transient({ db }).create({
        userId: user.id,
        email: "x@y.z",
        expiresAt: new Date(Date.now() - 1000),
      })
    ).token;

    await expect(verifyMagicLink(db, token)).rejects.toMatchObject({
      code: "token_expired",
    });

    const remaining = await db.select().from(authTokens);
    expect(remaining).toHaveLength(0);
  });

  test("rejects when the linked user is disabled", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      role: "editor",
      email: "x@y.z",
      disabledAt: new Date(),
    });
    const token = (
      await authTokenFactory
        .transient({ db })
        .create({ userId: user.id, email: "x@y.z" })
    ).token;

    await expect(verifyMagicLink(db, token)).rejects.toMatchObject({
      code: "account_disabled",
    });
  });

  test("ignores tokens of a different type stored under the same hash", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({ role: "admin" });
    // An invite-typed token must not be accepted as a magic-link, even though
    // both live in auth_tokens under the same hash scheme.
    const { token: raw, row } = await authTokenFactory
      .transient({ db })
      .create({
        type: "invite",
        userId: user.id,
        email: user.email,
        role: "subscriber",
      });

    await expect(verifyMagicLink(db, raw)).rejects.toMatchObject({
      code: "token_invalid",
    });

    // The invite row is untouched.
    const found = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, row.hash),
    });
    expect(found?.type).toBe("invite");
  });

  test("throws MagicLinkError instances for all reject paths", async () => {
    const db = await createTestDb();
    await expect(verifyMagicLink(db, "x")).rejects.toBeInstanceOf(
      MagicLinkError,
    );
  });
});

describe("verifyMagicLink — signup branch (userId null)", () => {
  test("provisions a user with the domain's defaultRole + emailVerifiedAt set", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "author",
      isEnabled: true,
    });
    const token = (
      await authTokenFactory
        .transient({ db })
        .create({ userId: null, email: "newcomer@example.com" })
    ).token;

    const result = await verifyMagicLink(db, token);
    expect(result.user.email).toBe("newcomer@example.com");
    expect(result.user.role).toBe("author");
    expect(result.user.emailVerifiedAt).not.toBeNull();
    // Fresh provision — first sign-in for this user.
    expect(result.created).toBe(true);

    // The token row is gone (single-use).
    const remaining = await db.select().from(authTokens);
    expect(remaining).toHaveLength(0);
  });

  test("rejects with domain_not_allowed when the domain was disabled mid-flight", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    // Domain was enabled at request time (token issued), then admin
    // disabled it before the user clicked.
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "author",
      isEnabled: false,
    });
    const token = (
      await authTokenFactory
        .transient({ db })
        .create({ userId: null, email: "newcomer@example.com" })
    ).token;

    await expect(verifyMagicLink(db, token)).rejects.toMatchObject({
      code: "domain_not_allowed",
    });
    // No user was provisioned.
    const created = await db.query.users.findFirst({
      where: eq(users.email, "newcomer@example.com"),
    });
    expect(created).toBeUndefined();
  });

  test("rejects with domain_not_allowed when the allowed-domains row was removed mid-flight", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    const token = (
      await authTokenFactory
        .transient({ db })
        .create({ userId: null, email: "newcomer@example.com" })
    ).token;
    // No allowed_domains row at all — domain was deleted between request
    // and verify, or the row never existed (defensive: token was hand-
    // rolled).

    await expect(verifyMagicLink(db, token)).rejects.toMatchObject({
      code: "domain_not_allowed",
    });
  });

  test("rejects with registration_closed when the system has zero users at verify time", async () => {
    const db = await createTestDb();
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "admin",
      isEnabled: true,
    });
    // Hand-rolled signup token — the request path would refuse to
    // issue this when zero users exist, but a hand-rolled DB state or
    // a now-deleted-admin race could surface it.
    const token = (
      await authTokenFactory
        .transient({ db })
        .create({ userId: null, email: "newcomer@example.com" })
    ).token;

    await expect(verifyMagicLink(db, token)).rejects.toMatchObject({
      code: "registration_closed",
    });
  });

  test("bootstrapAllowed=true mints the first admin via magic-link", async () => {
    const db = await createTestDb();
    await allowedDomainFactory.transient({ db }).create({
      domain: "example.com",
      defaultRole: "subscriber",
      isEnabled: true,
    });
    const token = (
      await authTokenFactory
        .transient({ db })
        .create({ userId: null, email: "first@example.com" })
    ).token;

    const result = await verifyMagicLink(db, token, {
      bootstrapAllowed: true,
    });
    // provisionUser auto-promotes the very first user to admin.
    expect(result.user.role).toBe("admin");
    expect(result.user.email).toBe("first@example.com");
    expect(result.created).toBe(true);
  });

  test("falls through to sign-in if a user with this email exists at verify time", async () => {
    // Race: two paths created the same user during the 15-min window —
    // OAuth signup completed while the magic-link signup token was
    // pending. The link click should sign the user into the now-
    // existing row, not refuse and not duplicate.
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    const raced = await userFactory.transient({ db }).create({
      email: "newcomer@example.com",
      role: "subscriber",
    });
    const token = (
      await authTokenFactory
        .transient({ db })
        .create({ userId: null, email: "newcomer@example.com" })
    ).token;

    const result = await verifyMagicLink(db, token);
    expect(result.user.id).toBe(raced.id);
    expect(result.user.role).toBe("subscriber");
    // The race-retry path links an existing user, not a fresh provision.
    expect(result.created).toBe(false);
  });

  test("rejects when the raced existing user is disabled", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await userFactory.transient({ db }).create({
      email: "newcomer@example.com",
      role: "subscriber",
      disabledAt: new Date(),
    });
    const token = (
      await authTokenFactory
        .transient({ db })
        .create({ userId: null, email: "newcomer@example.com" })
    ).token;

    await expect(verifyMagicLink(db, token)).rejects.toMatchObject({
      code: "account_disabled",
    });
  });
});
