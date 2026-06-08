import { describe, expect, test } from "vitest";

import { eq } from "../db/index.js";
import { authTokens } from "../db/schema/auth_tokens.js";
import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { createPreviewToken, verifyPreviewToken } from "./preview-token.js";

describe("preview tokens", () => {
  test("a minted token verifies back to its entry id", async () => {
    const db = await createTestDb();
    const user = await factoriesFor(db).user.create();

    const token = await createPreviewToken(db, {
      entryId: 42,
      userId: user.id,
    });
    expect(await verifyPreviewToken(db, token)).toBe(42);
  });

  test("only the hash is persisted, never the raw token", async () => {
    const db = await createTestDb();
    const user = await factoriesFor(db).user.create();
    const token = await createPreviewToken(db, { entryId: 7, userId: user.id });

    const rows = await db.query.authTokens.findMany({
      where: eq(authTokens.type, "preview_link"),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hash).not.toBe(token);
    expect(rows[0]?.payload).toEqual({ entryId: 7 });
  });

  test("an expired token does not verify", async () => {
    const db = await createTestDb();
    const user = await factoriesFor(db).user.create();
    const token = await createPreviewToken(db, { entryId: 1, userId: user.id });
    // Backdate the row past its expiry.
    await db
      .update(authTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authTokens.type, "preview_link"));
    expect(await verifyPreviewToken(db, token)).toBeNull();
  });

  test("an unknown or non-preview token does not verify", async () => {
    const db = await createTestDb();
    expect(await verifyPreviewToken(db, "not-a-real-token")).toBeNull();
  });
});
