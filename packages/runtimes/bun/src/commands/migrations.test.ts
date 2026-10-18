import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MigrationLocation, PlumixApp } from "plumix";
import { createDispatcherHarness } from "plumix/test";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

import { bunSqlite } from "../bun-sqlite.js";
import { migrations } from "./migrations.js";

let base: PlumixApp;
let dir: string;

beforeAll(async () => {
  ({ app: base } = await createDispatcherHarness());
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-bun-migrations-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function open(
  database: PlumixApp["config"]["database"],
  location: MigrationLocation = "site",
) {
  return migrations.open({
    cwd: dir,
    config: { ...base.config, database },
    location,
    binding: undefined,
    targetValues: {},
  });
}

/** Core's shipped history, read from the workspace. */
const CORE = {
  migrationsFolder: fileURLToPath(
    new URL("../../../../core/migrations", import.meta.url),
  ),
  migrationsTable: "__drizzle_migrations_core",
};

describe("bun migrations", () => {
  test("applies a history to the file bunSqlite() names, relative to the project root", async () => {
    const db = await open(bunSqlite({ path: "data/site.sqlite" }));
    try {
      await db.migrate(CORE);
      expect(
        await db.all(
          "SELECT name FROM sqlite_master WHERE name = 'entries_change_feed_insert'",
        ),
      ).toEqual([{ name: "entries_change_feed_insert" }]);
    } finally {
      await db.close();
    }
    expect(existsSync(join(dir, "data/site.sqlite"))).toBe(true);
  });

  test("a batch writes every statement or none", async () => {
    const db = await open(bunSqlite({ path: "data/site.sqlite" }));
    try {
      await db.batch([{ sql: "CREATE TABLE t (id integer)", params: [] }]);
      await expect(
        db.batch([
          { sql: "INSERT INTO t (id) VALUES (?)", params: [1] },
          { sql: "INSERT INTO missing (id) VALUES (1)", params: [] },
        ]),
      ).rejects.toThrow(/missing/);
      expect(await db.all("SELECT id FROM t")).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("its drizzle writes to the same database a data migration reshapes", async () => {
    const db = await open(bunSqlite({ path: "data/site.sqlite" }));
    try {
      await db.batch([{ sql: "CREATE TABLE t (id integer)", params: [] }]);
      await db.drizzle.run("INSERT INTO t (id) VALUES (7)");
      expect(await db.all("SELECT id FROM t")).toEqual([{ id: 7 }]);
    } finally {
      await db.close();
    }
  });

  test("a wipe drops every table, foreign keys and tracking tables included, and leaves SQLite's own", async () => {
    const db = await open(bunSqlite({ path: "data/site.sqlite" }));
    try {
      await db.migrate(CORE);
      await db.batch([
        {
          sql: "CREATE TABLE parent (id integer PRIMARY KEY AUTOINCREMENT)",
          params: [],
        },
        {
          sql: "CREATE TABLE child (parent_id integer REFERENCES parent (id) ON DELETE CASCADE)",
          params: [],
        },
        { sql: "CREATE VIRTUAL TABLE notes USING fts5(body)", params: [] },
        { sql: "INSERT INTO parent DEFAULT VALUES", params: [] },
        { sql: "INSERT INTO child (parent_id) VALUES (1)", params: [] },
      ]);

      await db.wipe();

      expect(
        await db.all("SELECT type, name FROM sqlite_master ORDER BY name"),
      ).toEqual([{ type: "table", name: "sqlite_sequence" }]);
      expect(await db.all("PRAGMA foreign_keys")).toEqual([
        { foreign_keys: 1 },
      ]);
    } finally {
      await db.close();
    }
  });

  test("opens a scratch database in memory, leaving the file alone", async () => {
    const db = await open(bunSqlite({ path: "data/site.sqlite" }), "memory");
    await db.migrate(CORE);
    await db.close();
    expect(existsSync(join(dir, "data/site.sqlite"))).toBe(false);
  });

  test("refuses a database slot it cannot open, naming the slot it found", async () => {
    await expect(
      open({ kind: "libsql", connect: () => ({ db: {} }) }),
    ).rejects.toThrow(/database slot is "libsql"/);
  });
});
