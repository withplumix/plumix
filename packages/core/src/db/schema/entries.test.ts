import { describe, expect, test } from "vitest";

import { factoriesFor } from "../../test/factories.js";
import { createTestDb } from "../../test/harness.js";
import { eq } from "../index.js";
import { entries } from "./entries.js";

describe("entries.updatedAt", () => {
  test("an identical direct update leaves the timestamp in place", async () => {
    const db = await createTestDb();
    const factory = factoriesFor(db);
    const author = await factory.user.create();
    const entry = await factory.entry.create({
      authorId: author.id,
      title: "Same title",
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });

    await db
      .update(entries)
      .set({ title: "Same title" })
      .where(eq(entries.id, entry.id));

    expect(
      (await db.query.entries.findFirst({ where: eq(entries.id, entry.id) }))
        ?.updatedAt,
    ).toEqual(new Date("2100-01-01T00:00:00Z"));
  });

  // The token a guarded write checks: a write that skips the helpers must
  // still move it, or an open copy would overwrite that write unnoticed.
  test("a direct update that leaves it out still moves it past its value", async () => {
    const db = await createTestDb();
    const factory = factoriesFor(db);
    const author = await factory.user.create();
    // Ahead of the clock, so only a token moved past its own value passes.
    const ahead = new Date("2100-01-01T00:00:00Z");
    const entry = await factory.entry.create({
      authorId: author.id,
      updatedAt: ahead,
    });

    await db
      .update(entries)
      .set({ title: "Edited directly" })
      .where(eq(entries.id, entry.id));
    const row = await db.query.entries.findFirst({
      where: eq(entries.id, entry.id),
    });

    expect(row?.updatedAt).toEqual(new Date("2100-01-01T00:00:01Z"));
  });
});
