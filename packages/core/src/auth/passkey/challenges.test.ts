import { describe, expect, test } from "vitest";

import { createTestDb } from "../../test/harness.js";
import { consumeChallenge, issueChallenge } from "./challenges.js";

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
});
