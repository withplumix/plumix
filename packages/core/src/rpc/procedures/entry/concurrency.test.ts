import { describe, expect, test } from "vitest";

import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { factoriesFor } from "../../../test/factories.js";
import { createTestDb } from "../../../test/harness.js";
import { entryRows } from "./concurrency.js";

describe("writeAsSystem", () => {
  test("a write that lands after the read sends it back to decide from the entry as it is now", async () => {
    const db = await createTestDb();
    const factory = factoriesFor(db);
    await factory.trashed.create({ slug: "system-write-bystander" });
    const read = await factory.draft.create({
      slug: "system-write-retry",
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
    await db
      .update(entries)
      .set({ status: "published" })
      .where(eq(entries.id, read.id));
    const decidedFrom: string[] = [];

    const result = await entryRows(db).writeAsSystem(read, (row) => {
      decidedFrom.push(row.status);
      return { status: "trash" };
    });

    expect(decidedFrom).toEqual(["draft", "published"]);
    expect(result).toMatchObject({
      written: true,
      row: { status: "trash", updatedAt: new Date("2100-01-01T00:00:02Z") },
    });
  });

  test("a decision to leave the entry alone writes nothing", async () => {
    const db = await createTestDb();
    const read = await factoriesFor(db).trashed.create({
      slug: "system-write-noop",
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });

    const result = await entryRows(db).writeAsSystem(read, () => undefined);

    expect(result).toMatchObject({ written: false, row: { id: read.id } });
    expect(
      await db.query.entries.findFirst({ where: eq(entries.id, read.id) }),
    ).toMatchObject({ updatedAt: new Date("2100-01-01T00:00:00Z") });
  });
});
