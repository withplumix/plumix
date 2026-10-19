import { describe, expect, test } from "vitest";

import { factoriesFor } from "../../test/factories.js";
import { createTestDb } from "../../test/harness.js";
import { eq } from "../index.js";
import { users } from "./users.js";

describe("users.updatedAt", () => {
  // The token a guarded write checks: a write that skips the helpers must
  // still move it, or an open copy would overwrite that write unnoticed.
  test("a direct update that leaves it out still moves it past its value", async () => {
    const db = await createTestDb();
    const factory = factoriesFor(db);
    // Ahead of the clock, so only a token moved past its own value passes.
    const user = await factory.user.create({
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });

    const [row] = await db
      .update(users)
      .set({ name: "Edited directly" })
      .where(eq(users.id, user.id))
      .returning({ updatedAt: users.updatedAt });

    expect(row?.updatedAt).toEqual(new Date("2100-01-01T00:00:01Z"));
  });
});
