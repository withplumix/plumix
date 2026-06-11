import { describe, expect, test } from "vitest";

import { eq } from "../db/index.js";
import { authTokens } from "../db/schema/auth_tokens.js";
import { authTokenFactory, userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import {
  consumeInviteToken,
  InviteError,
  validateInviteToken,
} from "./invite.js";
import { generateToken } from "./tokens.js";

describe("validateInviteToken", () => {
  test("returns the invite when the token is valid and fields are present", async () => {
    const db = await createTestDb();
    const user = await userFactory
      .transient({ db })
      .create({ email: "invitee@example.test", role: "author" });
    const { token, row } = await authTokenFactory.transient({ db }).create({
      type: "invite",
      userId: user.id,
      email: user.email,
      role: "author",
    });

    const invite = await validateInviteToken(db, token);
    expect(invite.tokenHash).toBe(row.hash);
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
    const { token } = await authTokenFactory.transient({ db }).create({
      type: "magic_link",
      userId: user.id,
      email: user.email,
      role: "author",
    });
    await expect(validateInviteToken(db, token)).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  test("throws invalid_token when required fields are null", async () => {
    const db = await createTestDb();
    const { token } = await authTokenFactory.transient({ db }).create({
      type: "invite",
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
    const { token } = await authTokenFactory.transient({ db }).create({
      type: "invite",
      userId: user.id,
      email: user.email,
      role: "author",
      expiresAt: new Date(Date.now() - 60_000),
    });
    await expect(validateInviteToken(db, token)).rejects.toMatchObject({
      code: "token_expired",
    });
  });

  test("is idempotent — does not consume the token on success", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create();
    const { token, row } = await authTokenFactory.transient({ db }).create({
      type: "invite",
      userId: user.id,
      email: user.email,
      role: "author",
    });

    await validateInviteToken(db, token);
    await validateInviteToken(db, token);

    const stored = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, row.hash),
    });
    expect(stored).toBeDefined();
  });
});

describe("consumeInviteToken", () => {
  test("deletes the token row", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create();
    const { token, row } = await authTokenFactory.transient({ db }).create({
      type: "invite",
      userId: user.id,
      email: user.email,
      role: "author",
    });

    await consumeInviteToken(db, row.hash);

    const found = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, row.hash),
    });
    expect(found).toBeUndefined();
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
  const err = InviteError.tokenExpired();
  expect(err).toBeInstanceOf(Error);
  expect(err.name).toBe("InviteError");
  expect(err.code).toBe("token_expired");
});
