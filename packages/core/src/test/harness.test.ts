import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";

import { applyTestSchema, createTestDb } from "./harness.js";

// Stands in for a plugin's `schema.ts` namespace object — one module-level
// value, so repeat calls hit the compiled-SQL cache the way real ones do.
const pluginSchema = {
  widgets: sqliteTable("widgets", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
  }),
};

describe("applyTestSchema", () => {
  test("layers a plugin's tables onto a core test db", async () => {
    const db = await createTestDb();

    await applyTestSchema(db, pluginSchema);
    await db.insert(pluginSchema.widgets).values({ id: 1, name: "sprocket" });

    expect(await db.select().from(pluginSchema.widgets)).toEqual([
      { id: 1, name: "sprocket" },
    ]);
  });

  test("compiles a schema module once and replays it per db", async () => {
    const [first, second] = await Promise.all([createTestDb(), createTestDb()]);
    await Promise.all([
      applyTestSchema(first, pluginSchema),
      applyTestSchema(second, pluginSchema),
    ]);

    await second.insert(pluginSchema.widgets).values({ id: 2, name: "cog" });

    expect(await first.select().from(pluginSchema.widgets)).toEqual([]);
    expect(await second.select().from(pluginSchema.widgets)).toHaveLength(1);
  });
});
