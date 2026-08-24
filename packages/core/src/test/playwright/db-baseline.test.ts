import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, test } from "vitest";

import {
  captureDbBaseline,
  parseDbBaseline,
  restoreDbBaseline,
  serializeDbBaseline,
} from "./db-baseline.js";

const openClients: Client[] = [];
const tempDirs: string[] = [];

async function makeDb(statements: readonly string[]): Promise<Client> {
  const dir = await mkdtemp(join(tmpdir(), "plumix-baseline-"));
  tempDirs.push(dir);
  const client = createClient({ url: `file:${join(dir, "test.sqlite")}` });
  openClients.push(client);
  await client.execute("PRAGMA foreign_keys = ON");
  for (const stmt of statements) await client.execute(stmt);
  return client;
}

async function rowsOf(client: Client, table: string): Promise<unknown[]> {
  const result = await client.execute(`SELECT * FROM "${table}" ORDER BY id`);
  return result.rows.map((row) => ({ ...row }));
}

afterEach(async () => {
  for (const client of openClients.splice(0)) client.close();
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("captureDbBaseline / restoreDbBaseline", () => {
  test("restores rows a test deleted, and drops rows a test added", async () => {
    const client = await makeDb([
      "CREATE TABLE widget (id INTEGER PRIMARY KEY, label TEXT NOT NULL)",
      "INSERT INTO widget (id, label) VALUES (1, 'seeded')",
    ]);
    const baseline = await captureDbBaseline(client);

    await client.execute("DELETE FROM widget");
    await client.execute("INSERT INTO widget (id, label) VALUES (9, 'junk')");

    await restoreDbBaseline(client, baseline);

    expect(await rowsOf(client, "widget")).toEqual([
      { id: 1, label: "seeded" },
    ]);
  });

  // Tables refill in name order, so `child` is reinserted while `parent`
  // is still empty. Checking foreign keys per statement fails there;
  // deferring to commit is what makes the order irrelevant.
  test("restores tables that reference each other, whatever the order", async () => {
    const client = await makeDb([
      "CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
      "CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id))",
      "INSERT INTO parent (id, name) VALUES (1, 'p')",
      "INSERT INTO child (id, parent_id) VALUES (1, 1)",
    ]);
    const baseline = await captureDbBaseline(client);

    await client.execute("DELETE FROM child");
    await restoreDbBaseline(client, baseline);

    expect(await rowsOf(client, "child")).toEqual([{ id: 1, parent_id: 1 }]);
    expect(await rowsOf(client, "parent")).toEqual([{ id: 1, name: "p" }]);
  });

  test("round-trips nulls and numbers", async () => {
    const client = await makeDb([
      "CREATE TABLE odd (id INTEGER PRIMARY KEY, maybe TEXT, size REAL)",
      "INSERT INTO odd (id, maybe, size) VALUES (1, NULL, 1.5)",
    ]);
    const baseline = await captureDbBaseline(client);

    await client.execute("DELETE FROM odd");
    await restoreDbBaseline(client, baseline);

    expect(await rowsOf(client, "odd")).toEqual([
      { id: 1, maybe: null, size: 1.5 },
    ]);
  });

  // The baseline is written by one Playwright worker and read by the next,
  // so it has to survive a file. `credentials.public_key` is a BLOB in every
  // playground, and a blob does not survive `JSON.stringify`.
  test("survives a round-trip through text, blobs included", async () => {
    const client = await makeDb([
      "CREATE TABLE credential (id INTEGER PRIMARY KEY, public_key BLOB NOT NULL)",
      "INSERT INTO credential (id, public_key) VALUES (1, x'0001fe7f')",
    ]);
    const baseline = await captureDbBaseline(client);

    const revived = parseDbBaseline(serializeDbBaseline(baseline));
    await client.execute("DELETE FROM credential");
    await restoreDbBaseline(client, revived);

    const result = await client.execute("SELECT public_key FROM credential");
    const stored = result.rows[0]?.public_key;
    expect([...new Uint8Array(stored as ArrayBuffer)]).toEqual([
      0x00, 0x01, 0xfe, 0x7f,
    ]);
  });

  // `SELECT *` hands back generated columns and `INSERT` refuses them, so
  // taking the column list from the select would make any schema using
  // `.generatedAlwaysAs()` fail the restore for every suite at once.
  test("skips generated columns, which cannot be inserted", async () => {
    const client = await makeDb([
      "CREATE TABLE priced (id INTEGER PRIMARY KEY, net REAL NOT NULL, gross REAL GENERATED ALWAYS AS (net * 1.2) STORED)",
      "INSERT INTO priced (id, net) VALUES (1, 10.0)",
    ]);
    const baseline = await captureDbBaseline(client);

    await client.execute("DELETE FROM priced");
    await restoreDbBaseline(client, baseline);

    expect(await rowsOf(client, "priced")).toEqual([
      { id: 1, net: 10, gross: 12 },
    ]);
  });

  // A virtual table's shadow tables are ordinary tables to `sqlite_master`
  // and carry no prefix marking them, so refilling them independently
  // corrupts the index they belong to.
  test("leaves virtual tables and their shadow tables alone", async () => {
    const client = await makeDb([
      "CREATE VIRTUAL TABLE search USING fts5(body)",
      "INSERT INTO search (body) VALUES ('hello world')",
      "CREATE TABLE plain (id INTEGER PRIMARY KEY)",
    ]);
    const baseline = await captureDbBaseline(client);

    await restoreDbBaseline(client, baseline);

    expect(baseline.tables.map((t) => t.name)).toEqual(["plain"]);
    const hits = await client.execute(
      "SELECT body FROM search WHERE search MATCH 'hello'",
    );
    expect(hits.rows).toHaveLength(1);
  });

  // An id the suite already handed out must not come back attached to a
  // different row, so the autoincrement counter never rewinds on restore.
  test("does not rewind the autoincrement counter", async () => {
    const client = await makeDb([
      "CREATE TABLE counted (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)",
      "INSERT INTO counted (v) VALUES ('seeded')",
    ]);
    const baseline = await captureDbBaseline(client);

    await client.execute("INSERT INTO counted (v) VALUES ('later')");
    await restoreDbBaseline(client, baseline);
    await client.execute("INSERT INTO counted (v) VALUES ('after restore')");

    const result = await client.execute("SELECT id FROM counted ORDER BY id");
    expect(result.rows.map((r) => r.id)).toEqual([1, 3]);
  });
});
