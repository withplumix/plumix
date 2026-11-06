import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { factoriesFor } from "../test/factories.js";
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
    const factory = factoriesFor(db);
    const subscriber = await factory.user.create({
      slug: "sub",
      role: "subscriber",
    });
    const contributor = await factory.user.create({
      slug: "con",
      role: "contributor",
    });
    await factory.user.create({ slug: "ed", role: "editor" });
    await factory.invite.create({
      hash: "a",
      userId: subscriber.id,
      role: "subscriber",
    });
    await factory.invite.create({
      hash: "b",
      userId: contributor.id,
      role: "contributor",
    });

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
    await factoriesFor(db).user.create({ role: "subscriber" });
    await runCoreDataMigrations(db);

    await runCoreDataMigrations(db);

    expect(await db.all(sql`SELECT role FROM users`)).toEqual([
      { role: "member" },
    ]);
  });
});
