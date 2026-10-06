import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";

import {
  applyCoreTestSchema,
  applyTestSchema,
  createTestDb,
} from "./harness.js";

// A plugin's history, hand-written so its one migration is dated 1970: older
// than anything core ships, which is the case a tracking table shared with
// core would skip.
const widgetsMigrations = fileURLToPath(
  new URL("fixtures/widgets/migrations", import.meta.url),
);

const widgets = sqliteTable("widgets", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

function bareDb() {
  return drizzle(createClient({ url: ":memory:" }), { casing: "snake_case" });
}

async function objectNames(
  db: ReturnType<typeof bareDb>,
  type: "table" | "trigger",
): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = ${type} AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%' ORDER BY name`,
  );
  return rows.map((row) => row.name);
}

describe("applyCoreTestSchema", () => {
  test("builds every core table and the change-feed triggers from core's shipped history", async () => {
    const db = bareDb();

    await applyCoreTestSchema(db);

    expect(await objectNames(db, "table")).toEqual([
      "allowed_domains",
      "api_tokens",
      "auth_tokens",
      "credentials",
      "device_codes",
      "entries",
      "entry_changes",
      "entry_term",
      "oauth_accounts",
      "scheduled_task_claims",
      "scheduled_task_leases",
      "sessions",
      "settings",
      "terms",
      "users",
    ]);
    expect(await objectNames(db, "trigger")).toEqual([
      "entries_change_feed_delete",
      "entries_change_feed_insert",
      "entries_change_feed_update",
    ]);
  });
});

describe("applyTestSchema", () => {
  test("layers a plugin's history onto a core test db, however old its migrations", async () => {
    const db = await createTestDb();

    await applyTestSchema(db, widgetsMigrations);
    await db.insert(widgets).values({ id: 1, name: "sprocket" });

    expect(await db.select().from(widgets)).toEqual([
      { id: 1, name: "sprocket" },
    ]);
  });

  test("builds the plugin's tables afresh on every db", async () => {
    const [first, second] = await Promise.all([createTestDb(), createTestDb()]);
    await Promise.all([
      applyTestSchema(first, widgetsMigrations),
      applyTestSchema(second, widgetsMigrations),
    ]);

    await second.insert(widgets).values({ id: 2, name: "cog" });

    expect(await first.select().from(widgets)).toEqual([]);
    expect(await second.select().from(widgets)).toHaveLength(1);
  });
});
