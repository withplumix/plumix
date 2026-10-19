import { describe, expect, test } from "vitest";

import { factoriesFor } from "../../test/factories.js";
import { createTestDb } from "../../test/harness.js";
import { eq } from "../index.js";
import { terms } from "./terms.js";

describe("terms.version", () => {
  // The token a guarded write checks: a write that skips the helpers must
  // still move it, or an open copy would overwrite that write unnoticed.
  test("a direct update that leaves it out still moves it by one", async () => {
    const db = await createTestDb();
    const term = await factoriesFor(db).term.create({ version: 4 });

    const [row] = await db
      .update(terms)
      .set({ name: "Edited directly" })
      .where(eq(terms.id, term.id))
      .returning({ version: terms.version });

    expect(row?.version).toBe(5);
  });
});
