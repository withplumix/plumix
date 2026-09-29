import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TracedContext } from "plumix/test";
import { sql } from "drizzle-orm";
import { eq } from "plumix/db";
import * as schema from "plumix/schema";
import { users } from "plumix/schema";
import { applyCoreTestSchema, createTracedContext } from "plumix/test";
import { describeDatabaseContract } from "plumix/test/conformance";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { bunSqlite } from "./bun-sqlite.js";
import { PROJECT_ROOT_ENV } from "./entry-constants.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-bun-sqlite-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function open(path: string, env = {}) {
  return bunSqlite({ path }).connect(
    env,
    new Request("https://cms.example/"),
    schema,
  ).db;
}

describeDatabaseContract({
  connect: () => ({ adapter: bunSqlite({ path: join(dir, "site.sqlite") }) }),
});

describe("bunSqlite", () => {
  // Bun's own defaults are the opposite on every one: foreign keys off, no
  // busy timeout, a rollback journal and FULL sync.
  test("a freshly opened file runs WAL, a 5 s busy timeout, NORMAL sync and foreign keys", () => {
    const path = join(dir, "data", "site.sqlite");
    const db = open(path);

    expect(db.all(sql`PRAGMA journal_mode`)).toEqual([{ journal_mode: "wal" }]);
    expect(db.all(sql`PRAGMA busy_timeout`)).toEqual([{ timeout: 5000 }]);
    expect(db.all(sql`PRAGMA synchronous`)).toEqual([{ synchronous: 1 }]);
    expect(db.all(sql`PRAGMA foreign_keys`)).toEqual([{ foreign_keys: 1 }]);
    expect(existsSync(path)).toBe(true);
  });

  test("a relative path resolves against the project root on the env", () => {
    open("data/site.sqlite", { [PROJECT_ROOT_ENV]: dir });

    expect(existsSync(join(dir, "data", "site.sqlite"))).toBe(true);
  });
});

describe("query spans", () => {
  async function traced(): Promise<TracedContext> {
    const db = open(join(dir, "site.sqlite"));
    await applyCoreTestSchema(db);
    return createTracedContext({ db });
  }

  test("a read records one kind-named span with sql, params and row count", async () => {
    const t = await traced();
    await t.harness.factory.user.create({ email: "ada@example.test" });

    await t.run(async () => {
      await t.harness.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.email, "ada@example.test"));
    });

    const spans = t.dbSpans();
    expect(spans.map((s) => s.name)).toEqual(["db: select"]);
    expect(spans[0]?.attributes).toEqual({
      "db.sql": 'select "email" from "users" where "users"."email" = ?',
      "db.params": ["ada@example.test"],
      "db.rows": 1,
    });
  });

  test("a write reports the rows it affected", async () => {
    const t = await traced();
    const user = await t.harness.factory.user.create({});

    await t.run(async () => {
      await t.harness.db.delete(users).where(eq(users.id, user.id));
    });

    const spans = t.dbSpans();
    expect(spans.map((s) => s.name)).toEqual(["db: delete"]);
    expect(spans[0]?.attributes["db.rows"]).toBe(1);
  });
});
