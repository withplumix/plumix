import { describe, expect, test } from "vitest";

import { eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { userFactory } from "../../test/factories.js";
import { createTestDb } from "../../test/harness.js";
import { generateToken, hashToken } from "../tokens.js";
import { MagicLinkError } from "./errors.js";
import { verifyMagicLink } from "./verify.js";

async function seedToken(
  db: Awaited<ReturnType<typeof createTestDb>>,
  userId: number,
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
