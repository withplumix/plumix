import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { count, eq, rowsAffected } from "plumix/db";
import * as schema from "plumix/schema";
import { credentials, sessions, users } from "plumix/schema";
import {
  applyTestSchema,
  createDispatcherHarness,
  generatePasskeyKeyPair,
} from "plumix/test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { nodeSqlite } from "./node-sqlite.js";

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
