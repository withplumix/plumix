import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db } from "plumix";
import type { TracedContext } from "plumix/test";
import { sql } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { count, eq, rowsAffected } from "plumix/db";
import { libsql } from "plumix/db/libsql";
import * as schema from "plumix/schema";
import { credentials, sessions, users } from "plumix/schema";
import {
  applyTestSchema,
  createDispatcherHarness,
  createTracedContext,
  DEV_ORIGIN,
  generatePasskeyKeyPair,
} from "plumix/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { nodeSqlite } from "./node-sqlite.js";

const flags = sqliteTable("flags", { id: integer().primaryKey() });

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-node-sqlite-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function open(path: string) {
  return nodeSqlite({ path }).connect(
    {},
    new Request("https://cms.example/"),
    schema,
  ).db;
}

describe("nodeSqlite", () => {
  test("a freshly opened file runs WAL, a 5 s busy timeout, NORMAL sync and foreign keys", () => {
    const path = join(dir, "data", "site.sqlite");
    const db = open(path);

    expect(db.get(sql`PRAGMA journal_mode`)).toEqual({ journal_mode: "wal" });
    expect(db.get(sql`PRAGMA busy_timeout`)).toEqual({ timeout: 5000 });
    expect(db.get(sql`PRAGMA synchronous`)).toEqual({ synchronous: 1 });
    expect(db.get(sql`PRAGMA foreign_keys`)).toEqual({ foreign_keys: 1 });
    expect(existsSync(path)).toBe(true);
  });
});

describe("queries through the shim", () => {
  test("insert-returning, join, count and rowsAffected", async () => {
    const db = open(join(dir, "site.sqlite"));
    await applyTestSchema(db, schema);

    const [user] = await db
      .insert(users)
      .values({ email: "ada@example.test", slug: "ada", role: "admin" })
      .returning();
    expect(user).toMatchObject({ id: 1, email: "ada@example.test" });
    if (!user) throw new Error("insert returned no row");

    await db.insert(sessions).values({
      id: "s1",
      userId: user.id,
      expiresAt: new Date(Date.UTC(2030, 0, 1)),
    });

    const joined = await db
      .select({ email: users.email, sessionId: sessions.id })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId));
    expect(joined).toEqual([{ email: "ada@example.test", sessionId: "s1" }]);

    const [counted] = await db.select({ value: count() }).from(sessions);
    expect(counted?.value).toBe(1);

    expect(rowsAffected(await db.delete(sessions))).toBe(1);
  });
});

describe("raw sql template parameters", () => {
  test("a boolean binds as 0/1 and a Date as epoch milliseconds", () => {
    const db = open(join(dir, "site.sqlite"));
    const at = new Date(Date.UTC(2030, 0, 1));
    const ms = 1_893_456_000_000;
    db.run(
      sql`CREATE TABLE flags (id INTEGER PRIMARY KEY, on_ INTEGER, at INTEGER)`,
    );

    db.run(sql`INSERT INTO flags (on_, at) VALUES (${true}, ${at})`);
    db.run(sql`INSERT INTO flags (on_, at) VALUES (${false}, ${at})`);

    expect(db.all(sql`SELECT on_, at FROM flags WHERE on_ = ${true}`)).toEqual([
      { on_: 1, at: ms },
    ]);
    expect(db.get(sql`SELECT on_ FROM flags WHERE on_ = ${false}`)).toEqual({
      on_: 0,
    });
    expect(db.values(sql`SELECT at FROM flags WHERE at = ${at}`)).toEqual([
      [ms],
      [ms],
    ]);
    expect(
      db
        .select({ id: flags.id })
        .from(flags)
        .where(sql`on_ = ${false} AND at = ${at}`)
        .get(),
    ).toEqual({ id: 2 });
  });
});

// The harness over `nodeSqlite` rather than its own libsql db: every request
// below is one core already proves, replayed through the shim.
async function harness() {
  const db = open(join(dir, "site.sqlite"));
  await applyTestSchema(db, schema);
  return createDispatcherHarness({ db });
}

describe("core requests over nodeSqlite", () => {
  test("the session RPC reads the signed-in user back", async () => {
    const h = await harness();
    const admin = await h.seedUser("admin");

    const response = await h.fetch("/_plumix/rpc/auth/session", {
      method: "POST",
      json: { json: {} },
      as: admin,
    });
    response.assertStatus(200);
    expect(await response.json()).toMatchObject({
      json: { user: { id: admin.id, email: admin.email } },
    });
  });

  test("an anonymous entry list is refused", async () => {
    const h = await harness();
    const response = await h.fetch("/_plumix/rpc/entry/list", {
      method: "POST",
      json: { json: {} },
    });
    response.assertStatus(401);
  });

  test("deleting a user cascades to its sessions and credentials", async () => {
    const h = await harness();
    const admin = await h.seedUser("admin");
    const target = await h.factory.user.create({});
    await h.factory.session.create({ userId: target.id });
    await h.factory.credential.create({
      userId: target.id,
      publicKey: Buffer.from(generatePasskeyKeyPair().publicKeySec1),
    });

    const response = await h.fetch("/_plumix/rpc/user/delete", {
      method: "POST",
      json: { json: { id: target.id } },
      as: admin,
    });
    response.assertStatus(200);

    const orphans = await Promise.all([
      h.db.select().from(sessions).where(eq(sessions.userId, target.id)),
      h.db.select().from(credentials).where(eq(credentials.userId, target.id)),
    ]);
    expect(orphans).toEqual([[], []]);
  });
});

describe("query spans", () => {
  async function traced(): Promise<TracedContext> {
    const db = open(join(dir, "site.sqlite"));
    await applyTestSchema(db, schema);
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

  // drizzle reads `.values()` through the statement's array mode — a different
  // pair of shim members from the object-mode reads above.
  test("an array-mode read is traced like any other", async () => {
    const t = await traced();
    await t.harness.factory.user.create({});
    await t.harness.factory.user.create({});

    await t.run(async () => {
      await t.harness.db.select({ id: users.id }).from(users).values();
    });

    const spans = t.dbSpans();
    expect(spans.map((s) => s.name)).toEqual(["db: select"]);
    expect(spans[0]?.attributes["db.rows"]).toBe(2);
  });

  test("each query gets its own span, never one per statement member", async () => {
    const t = await traced();

    await t.run(async () => {
      await t.harness.db.select().from(users);
      await t.harness.db.select().from(sessions);
    });

    expect(t.dbQueryCount()).toBe(2);
  });
});

// The debug bar's Database panel reads `db.sql` off the span tree, so the shim
// reaching the panel is the proof that a Node playground lists its queries.
describe("the debug bar over nodeSqlite", () => {
  afterEach(() => void vi.unstubAllEnvs());

  test("lists the request's queries in the Database panel", async () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    const h = await harness();

    const html = await (await h.dispatch(new Request(`${DEV_ORIGIN}/`))).text();

    const testid = 'data-testid="plumix-debug-panel-database"';
    const start = html.indexOf(testid);
    expect(start).toBeGreaterThan(-1);
    // The panel highlights SQL keyword by keyword, so the statement is split
    // across spans; what survives as text is the quoted table name and the
    // bound param — `db.sql` and `db.params` off the shim's span.
    const panel = html
      .slice(start, html.indexOf("plumix-debug-panel-", start + testid.length))
      .replaceAll("&quot;", '"');
    expect(panel).toContain('"settings"');
    expect(panel).toContain('"site"');
  });
});

// Statement-level parity only: a relational read is one batched round-trip on
// libsql (a single `db: <kind> (n)` span carrying `db.batch`) and N statements
// on the shim, so the two slots agree per query, not per round-trip.
describe("span parity with the libsql adapter", () => {
  async function spansFor(db: Db) {
    const t = await createTracedContext({ db });
    await t.run(async () => {
      const [user] = await t.harness.db
        .insert(users)
        .values({ email: "ada@example.test", slug: "ada", role: "admin" })
        .returning();
      const id = user?.id ?? 0;
      await t.harness.db.select().from(users);
      // A hit and a miss: a single-row read is the one place the two drivers
      // count differently if the shim gets `db.rows` wrong.
      await t.harness.db.select().from(users).where(eq(users.id, id)).get();
      await t.harness.db.select().from(users).where(eq(users.id, 0)).get();
      await t.harness.db.delete(users).where(eq(users.id, id));
    });
    return t.dbSpans().map((span) => ({ name: span.name, ...span.attributes }));
  }

  test("the same queries record the same spans on both slots", async () => {
    const node = open(join(dir, "node.sqlite"));
    await applyTestSchema(node, schema);
    // `DatabaseAdapter.connect` declares `db: unknown`; only nodeSqlite
    // narrows it.
    const remote = libsql({
      url: `file:${join(dir, "libsql.sqlite")}`,
    }).connect({}, new Request("https://cms.example/"), schema).db as Db;
    await applyTestSchema(remote, schema);

    const recorded = await spansFor(node);
    expect(recorded.map((span) => span.name)).toEqual([
      "db: insert",
      "db: select",
      "db: select",
      "db: select",
      "db: delete",
    ]);
    expect(recorded).toEqual(await spansFor(remote));
  });
});
