import { and, eq, sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { createTestDb } from "../test/harness.js";
import { defineDataMigration } from "./data-migration.js";
import { settings } from "./schema/index.js";

/**
 * The pattern a plugin's own test follows: call `up` against the harness's
 * database, then read what it left.
 */
const renameBeta = defineDataMigration({
  name: "rename-beta-enabled",
  async up({ db }) {
    await db
      .update(settings)
      .set({ key: "beta" })
      .where(
        and(eq(settings.group, "flags"), eq(settings.key, "beta_enabled")),
      );
  },
});

describe("a data migration's up", () => {
  test("renames a settings key when called against the harness database", async () => {
    const db = await createTestDb();
    await db
      .insert(settings)
      .values({ group: "flags", key: "beta_enabled", value: true });

    await renameBeta.up({ db });

    expect(
      await db
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(eq(settings.group, "flags")),
    ).toEqual([{ key: "beta", value: true }]);
  });

  test("can run again after it already ran, changing nothing", async () => {
    const db = await createTestDb();
    await db.run(
      sql`INSERT INTO settings ("group", key, value) VALUES ('flags', 'beta_enabled', 'true')`,
    );
    await renameBeta.up({ db });

    await renameBeta.up({ db });

    expect(await db.select({ key: settings.key }).from(settings)).toEqual([
      { key: "beta" },
    ]);
  });
});
