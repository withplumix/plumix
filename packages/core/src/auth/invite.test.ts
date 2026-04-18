import { describe, expect, test } from "vitest";

import { eq } from "../db/index.js";
import { authTokens } from "../db/schema/auth_tokens.js";
import { userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import {
  consumeInviteToken,
  InviteError,
  validateInviteToken,
} from "./invite.js";
import { generateToken, hashToken } from "./tokens.js";

async function seedInvite(
  db: Awaited<ReturnType<typeof createTestDb>>,
  overrides: {
    readonly userId?: number | null;
    readonly email?: string | null;
    readonly role?: "admin" | "editor" | "author" | null;
    readonly expiresInMs?: number;
    readonly type?: "invite" | "magic_link";
  } = {},
): Promise<{ token: string; tokenHash: string }> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  await db.insert(authTokens).values({
    hash: tokenHash,
    userId: overrides.userId ?? null,
    email: overrides.email ?? null,
    role: overrides.role ?? null,
    type: overrides.type ?? "invite",
    expiresAt: new Date(Date.now() + (overrides.expiresInMs ?? 60_000)),
  });
  return { token, tokenHash };
}

describe("validateInviteToken", () => {
  test("returns the invite when the token is valid and fields are present", async () => {
    const db = await createTestDb();
    const user = await userFactory
      .transient({ db })
      .create({ email: "invitee@example.test", role: "author" });
    const { token, tokenHash } = await seedInvite(db, {
      userId: user.id,
      email: user.email,
      role: "author",
    });

    const invite = await validateInviteToken(db, token);
    expect(invite.tokenHash).toBe(tokenHash);
    expect(invite.userId).toBe(user.id);
    expect(invite.email).toBe("invitee@example.test");
    expect(invite.role).toBe("author");
  });

  test("throws invalid_token when the token row doesn't exist", async () => {
    const db = await createTestDb();
    await expect(
      validateInviteToken(db, generateToken()),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  test("throws invalid_token for a non-invite token type", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create();
    const { token } = await seedInvite(db, {
      userId: user.id,
      email: user.email,
      role: "author",
      type: "magic_link",
    });
    await expect(validateInviteToken(db, token)).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  test("throws invalid_token when required fields are null", async () => {
    const db = await createTestDb();
    const { token } = await seedInvite(db, {
      userId: null,
      email: "x@example.test",
      role: "author",
    });
    await expect(validateInviteToken(db, token)).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  test("throws token_expired when expiresAt is in the past", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create();
    const { token } = await seedInvite(db, {
      userId: user.id,
      email: user.email,
      role: "author",
      expiresInMs: -60_000,
    });
    await expect(validateInviteToken(db, token)).rejects.toMatchObject({
      code: "token_expired",
    });
  });

  test("is idempotent — does not consume the token on success", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create();
    const { token, tokenHash } = await seedInvite(db, {
      userId: user.id,
      email: user.email,
      role: "author",
    });

    await validateInviteToken(db, token);
    await validateInviteToken(db, token);

    const row = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, tokenHash),
    });
    expect(row).toBeDefined();
  });
});

describe("consumeInviteToken", () => {
  test("deletes the token row", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create();
    const { token, tokenHash } = await seedInvite(db, {
      userId: user.id,
      email: user.email,
      role: "author",
    });

    await consumeInviteToken(db, tokenHash);

    const row = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, tokenHash),
    });
    expect(row).toBeUndefined();
    await expect(validateInviteToken(db, token)).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  test("is a no-op on a hash that doesn't exist", async () => {
    const db = await createTestDb();
    await expect(
      consumeInviteToken(db, "0".repeat(64)),
    ).resolves.toBeUndefined();
  });
});

test("InviteError carries a structured code", () => {
  const err = new InviteError("token_expired");
  expect(err).toBeInstanceOf(Error);
  expect(err.name).toBe("InviteError");
  expect(err.code).toBe("token_expired");
});
