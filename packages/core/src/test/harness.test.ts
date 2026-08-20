import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";

import { applyTestSchema, createTestDb } from "./harness.js";

const widgets = sqliteTable("widgets", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

describe("applyTestSchema", () => {
  test("layers a plugin's tables onto an existing core test db", async () => {
    const db = await createTestDb();

    await applyTestSchema(db, { widgets });
    await db.insert(widgets).values({ id: 1, name: "sprocket" });

    expect(await db.select().from(widgets)).toEqual([
      { id: 1, name: "sprocket" },
    ]);
  });
});
