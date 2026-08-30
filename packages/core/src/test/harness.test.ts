import { eq } from "drizzle-orm";
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

const auditedSchema = {
  gadgets: sqliteTable("gadgets", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
  }),
  gadgetChanges: sqliteTable("gadget_changes", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    op: text("op").notNull(),
  }),
};

const gadgetTriggers = [
  `CREATE TRIGGER gadgets_insert AFTER INSERT ON gadgets
   BEGIN INSERT INTO gadget_changes (op) VALUES ('insert'); END`,
  `CREATE TRIGGER gadgets_update AFTER UPDATE ON gadgets
   BEGIN INSERT INTO gadget_changes (op) VALUES ('update'); END`,
  `CREATE TRIGGER gadgets_delete AFTER DELETE ON gadgets
   BEGIN INSERT INTO gadget_changes (op) VALUES ('delete'); END`,
];

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

  test("applies raw statements alongside the compiled schema", async () => {
    const db = await createTestDb();
    await applyTestSchema(db, auditedSchema, gadgetTriggers);

    const { gadgets, gadgetChanges } = auditedSchema;
    await db.insert(gadgets).values({ id: 1, name: "sprocket" });
    await db.update(gadgets).set({ name: "cog" }).where(eq(gadgets.id, 1));
    await db.delete(gadgets).where(eq(gadgets.id, 1));

    expect(
      await db
        .select({ op: gadgetChanges.op })
        .from(gadgetChanges)
        .orderBy(gadgetChanges.id),
    ).toEqual([{ op: "insert" }, { op: "update" }, { op: "delete" }]);
  });
});
