import { createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

import type { DemoSqlExecutor } from "./storage.js";
import {
  dropDemoTables,
  initializeDemoStorage,
  splitStatements,
} from "./storage.js";

// A DemoSqlExecutor backed by an in-memory libsql database — the same
// engine core's test harness uses. Exercises the real SQL behavior
// (tables created, seeded, dropped) without a workerd Durable Object;
// the DO wrapper's `ctx.storage.sql` is proven end-to-end in the spine
// slice (#1342) and e2e (#1347).
function memoryExecutor(): DemoSqlExecutor {
  const client = createClient({ url: ":memory:" });
  return {
    async exec(sql) {
      await client.execute(sql);
    },
    async query(sql) {
      const result = await client.execute(sql);
      return result.rows;
    },
  };
}

const SCHEMA = "CREATE TABLE widget (id INTEGER PRIMARY KEY, label TEXT);";
const SEED = "INSERT INTO widget (label) VALUES ('demo');";

const BOOTSTRAP = `${SCHEMA} ${SEED}`;

describe("splitStatements", () => {
  test("splits on statement boundaries and drops drizzle markers", () => {
    const script = `CREATE TABLE a (id INTEGER);\n--> statement-breakpoint\nCREATE TABLE b (id INTEGER);`;
    expect(splitStatements(script)).toEqual([
      "CREATE TABLE a (id INTEGER)",
      "CREATE TABLE b (id INTEGER)",
    ]);
  });

  test("does not split on a semicolon inside a string literal", () => {
    const script = `INSERT INTO t (v) VALUES ('a;b'); INSERT INTO t (v) VALUES ('c');`;
    expect(splitStatements(script)).toEqual([
      "INSERT INTO t (v) VALUES ('a;b')",
      "INSERT INTO t (v) VALUES ('c')",
    ]);
  });

  test("ignores a semicolon inside a line comment", () => {
    const script = `-- a; comment\nSELECT 1;`;
    expect(splitStatements(script)).toEqual(["-- a; comment\nSELECT 1"]);
  });

  test("keeps a trigger body whole", () => {
    const trigger = [
      "CREATE TRIGGER t AFTER INSERT ON a",
      "  BEGIN",
      "    INSERT INTO b (id) VALUES (new.id);",
      "  END",
    ].join("\n");

    expect(splitStatements(`${trigger};\nSELECT 1;`)).toEqual([
      trigger,
      "SELECT 1",
    ]);
  });

  test("does not end a trigger body at an identifier ending in `end`", () => {
    const trigger = [
      "CREATE TRIGGER t AFTER INSERT ON a",
      "  BEGIN",
      "    INSERT INTO b (x2end) VALUES (1);",
      "    INSERT INTO c (id) VALUES (new.id);",
      "  END",
    ].join("\n");

    expect(splitStatements(`${trigger};`)).toEqual([trigger]);
  });

  test("does not treat a quoted identifier as a block keyword", () => {
    const trigger = [
      "CREATE TRIGGER t AFTER INSERT ON a",
      "  BEGIN",
      '    INSERT INTO b ("end") VALUES (1);',
      "    INSERT INTO c (id) VALUES (new.id);",
      "  END",
    ].join("\n");

    expect(splitStatements(`${trigger};`)).toEqual([trigger]);
  });

  test("still splits a script wrapped in a transaction", () => {
    const script =
      "BEGIN TRANSACTION;\nINSERT INTO a (id) VALUES (1);\nCOMMIT;";

    expect(splitStatements(script)).toEqual([
      "BEGIN TRANSACTION",
      "INSERT INTO a (id) VALUES (1)",
      "COMMIT",
    ]);
  });

  test("does not end a trigger body at a CASE expression's END", () => {
    const trigger = [
      "CREATE TRIGGER t AFTER UPDATE ON a",
      "  BEGIN",
      "    INSERT INTO b (id) VALUES (CASE WHEN new.id THEN 1 ELSE 2 END);",
      "    INSERT INTO c (id) VALUES (new.id);",
      "  END",
    ].join("\n");

    expect(splitStatements(`${trigger};`)).toEqual([trigger]);
  });
});

describe("initializeDemoStorage", () => {
  test("applies the bootstrap SQL so seeded rows are queryable", async () => {
    const sql = memoryExecutor();
    await initializeDemoStorage(sql, BOOTSTRAP);
    const rows = await sql.query("SELECT label FROM widget");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("demo");
  });

  test("applies a trigger and it fires on a later write", async () => {
    const sql = memoryExecutor();
    await initializeDemoStorage(
      sql,
      [
        SCHEMA,
        "CREATE TABLE widget_change (id INTEGER PRIMARY KEY, widget_id INTEGER);",
        "CREATE TRIGGER widget_ai AFTER INSERT ON widget",
        "  BEGIN",
        "    INSERT INTO widget_change (widget_id) VALUES (new.id);",
        "  END;",
        SEED,
      ].join("\n"),
    );

    expect(await sql.query("SELECT widget_id FROM widget_change")).toHaveLength(
      1,
    );
  });

  test("is idempotent: re-initializing with the same SQL is a no-op", async () => {
    const sql = memoryExecutor();
    const first = await initializeDemoStorage(sql, BOOTSTRAP);
    const second = await initializeDemoStorage(sql, BOOTSTRAP);
    expect(first).toBe(true);
    expect(second).toBe(false);
    // Seed was not re-applied — still exactly one row.
    const rows = await sql.query("SELECT id FROM widget");
    expect(rows).toHaveLength(1);
  });

  test("re-bootstraps when the schema/seed changes (heals a stale DO)", async () => {
    const sql = memoryExecutor();
    await initializeDemoStorage(sql, BOOTSTRAP);

    // A later deploy adds a column and reseeds — the version tag differs.
    const NEXT_SCHEMA =
      "CREATE TABLE widget (id INTEGER PRIMARY KEY, label TEXT, color TEXT);";
    const NEXT_SEED =
      "INSERT INTO widget (label, color) VALUES ('demo', 'red');";
    const reinit = await initializeDemoStorage(
      sql,
      `${NEXT_SCHEMA} ${NEXT_SEED}`,
    );
    expect(reinit).toBe(true);

    // The new column exists (a query touching it no longer throws) and the old
    // seed row was replaced, not duplicated.
    const rows = await sql.query("SELECT color FROM widget");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.color).toBe("red");

    // ...and it's now idempotent at the new version.
    expect(
      await initializeDemoStorage(sql, `${NEXT_SCHEMA} ${NEXT_SEED}`),
    ).toBe(false);
  });

  test("heals a DO carrying a pre-versioning `ready` marker", async () => {
    const sql = memoryExecutor();
    // Simulate an old deploy's marker: the legacy `(ready INTEGER)` shape with
    // no `version` column, alongside stale data.
    await sql.exec("CREATE TABLE widget (id INTEGER PRIMARY KEY, label TEXT)");
    await sql.exec("CREATE TABLE _plumix_demo_ready (ready INTEGER)");

    const reinit = await initializeDemoStorage(sql, BOOTSTRAP);
    expect(reinit).toBe(true);
    const rows = await sql.query("SELECT label FROM widget");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("demo");
  });
});

describe("dropDemoTables", () => {
  test("removes every user table so the session can be reclaimed", async () => {
    const sql = memoryExecutor();
    await initializeDemoStorage(
      sql,
      `${SCHEMA} CREATE TABLE gadget (id INTEGER PRIMARY KEY); ${SEED}`,
    );

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
