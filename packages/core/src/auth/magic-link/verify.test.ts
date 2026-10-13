import { describe, expect, test } from "vitest";

import { eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { authTokenFactory, userFactory } from "../../test/factories.js";
import { createTestDb } from "../../test/harness.js";
import { MagicLinkError } from "./errors.js";
import { consumeMagicLinkToken } from "./verify.js";

describe("consumeMagicLinkToken", () => {
  test("names the user a link was issued to and deletes the row", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({
      email: "alice@example.com",
    });
    const { token } = await authTokenFactory
      .transient({ db })
      .create({ userId: user.id, email: "alice@example.com" });

    const holder = await consumeMagicLinkToken(db, token);

    expect(holder).toEqual({ userId: user.id });
    expect(await db.select().from(authTokens)).toHaveLength(0);
  });

  test("names the address a sign-up link was issued to", async () => {
    const db = await createTestDb();
    const { token } = await authTokenFactory
      .transient({ db })
      .create({ userId: null, email: "newcomer@example.com" });

    const holder = await consumeMagicLinkToken(db, token);

    expect(holder).toEqual({ email: "newcomer@example.com" });
  });

  test("rejects an unknown token with token_invalid", async () => {
    const db = await createTestDb();
    await expect(
      consumeMagicLinkToken(db, "definitely-not-a-token"),
    ).rejects.toMatchObject({ code: "token_invalid" });
  });

  test("rejects an expired token with token_expired (and removes the row)", async () => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({ email: "x@y.z" });
    const { token } = await authTokenFactory.transient({ db }).create({
      userId: user.id,
      email: "x@y.z",
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(consumeMagicLinkToken(db, token)).rejects.toMatchObject({
      code: "token_expired",
    });
    expect(await db.select().from(authTokens)).toHaveLength(0);
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

    await expect(consumeMagicLinkToken(db, raw)).rejects.toMatchObject({
      code: "token_invalid",
    });
    const found = await db.query.authTokens.findFirst({
      where: eq(authTokens.hash, row.hash),
    });
    expect(found?.type).toBe("invite");
  });

  test("throws MagicLinkError instances for all reject paths", async () => {
    const db = await createTestDb();
    await expect(consumeMagicLinkToken(db, "x")).rejects.toBeInstanceOf(
      MagicLinkError,
    );
  });
});
