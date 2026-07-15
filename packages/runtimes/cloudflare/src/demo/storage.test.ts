import { createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

import type { DemoSqlExecutor } from "./storage.js";
import { dropDemoTables, initializeDemoStorage } from "./storage.js";

// A DemoSqlExecutor backed by an in-memory libsql database — the same
// engine core's test harness uses. Exercises the real SQL behavior
// (tables created, seeded, dropped) without a workerd Durable Object;
// the DO wrapper's `ctx.storage.sql` is proven end-to-end in the spine
// slice (#1342) and e2e (#1347).
function memoryExecutor(): DemoSqlExecutor {
  const client = createClient({ url: ":memory:" });
  return {
    async runScript(sql) {
      await client.executeMultiple(sql);
    },
    async query(sql) {
      const result = await client.execute(sql);
      return result.rows;
    },
  };
}

const SCHEMA = "CREATE TABLE widget (id INTEGER PRIMARY KEY, label TEXT);";
const SEED = "INSERT INTO widget (label) VALUES ('demo');";

describe("initializeDemoStorage", () => {
  test("applies schema and seed so seeded rows are queryable", async () => {
    const sql = memoryExecutor();
    await initializeDemoStorage(sql, { schemaSql: SCHEMA, seedSql: SEED });
    const rows = await sql.query("SELECT label FROM widget");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("demo");
  });

  test("is idempotent: re-initializing an existing database is a no-op", async () => {
    const sql = memoryExecutor();
    const first = await initializeDemoStorage(sql, {
      schemaSql: SCHEMA,
      seedSql: SEED,
    });
    const second = await initializeDemoStorage(sql, {
      schemaSql: SCHEMA,
      seedSql: SEED,
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    // Seed was not re-applied — still exactly one row.
    const rows = await sql.query("SELECT id FROM widget");
    expect(rows).toHaveLength(1);
  });
});

describe("dropDemoTables", () => {
  test("removes every user table so the session can be reclaimed", async () => {
    const sql = memoryExecutor();
    await initializeDemoStorage(sql, {
      schemaSql: `${SCHEMA} CREATE TABLE gadget (id INTEGER PRIMARY KEY);`,
      seedSql: SEED,
    });

    await dropDemoTables(sql);

    const remaining = await sql.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );
    expect(remaining).toHaveLength(0);
  });

  test("is a no-op on an empty database", async () => {
    const sql = memoryExecutor();
    await expect(dropDemoTables(sql)).resolves.toBeUndefined();
  });
});
