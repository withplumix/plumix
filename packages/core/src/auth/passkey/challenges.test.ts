import { describe, expect, test } from "vitest";

import { authTokens } from "../../db/schema/auth_tokens.js";
import { createTestDb } from "../../test/harness.js";
import {
  consumeChallenge,
  issueChallenge,
  pruneExpiredAuthTokens,
} from "./challenges.js";

describe("challenge store", () => {
  test("atomic single-use: a consumed challenge cannot be replayed", async () => {
    const db = await createTestDb();
    const { challenge } = await issueChallenge(db, 60_000);
    const first = await consumeChallenge(db, challenge);
    const second = await consumeChallenge(db, challenge);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  test("expired challenge resolves to null even though the row existed", async () => {
    const db = await createTestDb();
    const { challenge } = await issueChallenge(db, -1_000);
    expect(await consumeChallenge(db, challenge)).toBeNull();
  });

  test("pruneExpiredAuthTokens removes only expired rows", async () => {
    const db = await createTestDb();
    await issueChallenge(db, -60_000); // expired
    await issueChallenge(db, -60_000); // expired
    const { challenge: fresh } = await issueChallenge(db, 60_000);

    await pruneExpiredAuthTokens(db);

    const remaining = await db.select().from(authTokens);
    expect(remaining).toHaveLength(1);
    // The fresh challenge is still consumable — prune didn't touch it.
    expect(await consumeChallenge(db, fresh)).not.toBeNull();
  });
});
