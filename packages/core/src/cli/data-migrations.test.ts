import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { createTestDb } from "../test/harness.js";
import { CORE_DATA_MIGRATIONS } from "./data-migrations.js";

async function runCoreDataMigrations(
  db: Awaited<ReturnType<typeof createTestDb>>,
): Promise<void> {
  for (const migration of CORE_DATA_MIGRATIONS) await migration.up({ db });
}

describe("core's data migrations", () => {
  test("rename subscriber to member on users and invites, and leave contributors as they are", async () => {
    const db = await createTestDb();
    await db.run(sql`INSERT INTO users (email, slug, role) VALUES
      ('sub@example.test', 'sub', 'subscriber'),
      ('con@example.test', 'con', 'contributor'),
      ('ed@example.test', 'ed', 'editor')`);
    await db.run(sql`INSERT INTO auth_tokens (hash, email, type, role, expires_at) VALUES
      ('a', 'invited@example.test', 'invite', 'subscriber', 9999999999),
      ('b', 'other@example.test', 'invite', 'contributor', 9999999999)`);

    await runCoreDataMigrations(db);

    expect(
      await db.all(sql`SELECT slug, role FROM users ORDER BY slug`),
    ).toEqual([
      { slug: "con", role: "contributor" },
      { slug: "ed", role: "editor" },
      { slug: "sub", role: "member" },
    ]);
    expect(
      await db.all(sql`SELECT hash, role FROM auth_tokens ORDER BY hash`),
    ).toEqual([
      { hash: "a", role: "member" },
      { hash: "b", role: "contributor" },
    ]);
  });

  test("can run again after it already ran, changing nothing", async () => {
    const db = await createTestDb();
    await db.run(
      sql`INSERT INTO users (email, slug, role) VALUES ('sub@example.test', 'sub', 'subscriber')`,
    );
    await runCoreDataMigrations(db);

    await runCoreDataMigrations(db);

    expect(await db.all(sql`SELECT role FROM users`)).toEqual([
      { role: "member" },
    ]);
  });
});
