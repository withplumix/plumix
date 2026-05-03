import { describe, expect, test } from "vitest";

import { eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
import { allowedDomainFactory, userFactory } from "../../test/factories.js";
import { createTestDb } from "../../test/harness.js";
import { generateToken, hashToken } from "../tokens.js";
import { MagicLinkError } from "./errors.js";
import { verifyMagicLink } from "./verify.js";

async function seedToken(
  db: Awaited<ReturnType<typeof createTestDb>>,
  userId: number | null,
  email: string,
  ttlSeconds: number = 15 * 60,
): Promise<string> {
  const token = generateToken();
  const hash = await hashToken(token);
  await db.insert(authTokens).values({
    hash,
    userId,
    email,
    type: "magic_link",
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  });
  return token;
}

describe("verifyMagicLink", () => {
  test("returns the user and deletes the row on success", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });
    const token = await seedToken(db, user.id, "alice@example.com");

    const result = await verifyMagicLink(db, token);
    expect(result.id).toBe(user.id);

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
    const token = await seedToken(db, user.id, "x@y.z", -1);

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
    const token = await seedToken(db, user.id, "x@y.z");

    await expect(verifyMagicLink(db, token)).rejects.toMatchObject({
      code: "account_disabled",
    });
  });

  test("ignores tokens of a different type stored under the same hash", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({ role: "admin" });
    // Insert an invite-typed row whose hash matches what verifyMagicLink
    // would compute for a chosen raw token. Verify that we don't accept
    // it as a magic-link.
    const raw = generateToken();
    const hash = await hashToken(raw);
    await db.insert(authTokens).values({
      hash,
      userId: user.id,
      email: user.email,
      type: "invite",
      role: "subscriber",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(verifyMagicLink(db, raw)).rejects.toMatchObject({
      code: "token_invalid",
    });

    // The invite row is untouched.
    const row = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, hash),
    });
    expect(row?.type).toBe("invite");
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
    const token = await seedToken(db, null, "newcomer@example.com");

    const result = await verifyMagicLink(db, token);
    expect(result.email).toBe("newcomer@example.com");
    expect(result.role).toBe("author");
    expect(result.emailVerifiedAt).not.toBeNull();

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
    const token = await seedToken(db, null, "newcomer@example.com");

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
    const token = await seedToken(db, null, "newcomer@example.com");
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
    const token = await seedToken(db, null, "newcomer@example.com");

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
    const token = await seedToken(db, null, "first@example.com");

    const user = await verifyMagicLink(db, token, { bootstrapAllowed: true });
    // provisionUser auto-promotes the very first user to admin.
    expect(user.role).toBe("admin");
    expect(user.email).toBe("first@example.com");
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
    const token = await seedToken(db, null, "newcomer@example.com");

    const result = await verifyMagicLink(db, token);
    expect(result.id).toBe(raced.id);
    expect(result.role).toBe("subscriber");
  });

  test("rejects when the raced existing user is disabled", async () => {
    const db = await createTestDb();
    await userFactory.transient({ db }).create({ role: "admin" });
    await userFactory.transient({ db }).create({
      email: "newcomer@example.com",
      role: "subscriber",
      disabledAt: new Date(),
    });
    const token = await seedToken(db, null, "newcomer@example.com");

    await expect(verifyMagicLink(db, token)).rejects.toMatchObject({
      code: "account_disabled",
    });
  });
});
