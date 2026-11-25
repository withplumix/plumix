import { createClient } from "@libsql/client";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, test } from "vitest";

import { factoriesFor } from "../../test/factories.js";
import { CORE_MIGRATIONS, createTestDb } from "../../test/harness.js";
import { eq } from "../index.js";
import { terms } from "./terms.js";

test("the timestamp migration backfills existing terms and preserves foreign keys", async ({
  onTestFinished,
}) => {
  const client = createClient({ url: ":memory:" });
  onTestFinished(() => client.close());
  const migrations = readMigrationFiles({ migrationsFolder: CORE_MIGRATIONS });
  await client.execute("PRAGMA foreign_keys = ON");
  await client.batch(migrations.slice(0, 10).flatMap(({ sql }) => sql));
  await client.batch([
    "INSERT INTO users (id, email, slug) VALUES (1, 'editor@example.com', 'editor')",
    "INSERT INTO entries (id, title, slug, author_id) VALUES (1, 'Entry', 'entry', 1)",
    "INSERT INTO terms (id, taxonomy, name, slug) VALUES (1, 'category', 'Parent', 'parent')",
    "INSERT INTO terms (id, taxonomy, name, slug, parent_id, version) VALUES (2, 'category', 'Child', 'child', 1, 7)",
    "INSERT INTO entry_term (entry_id, term_id) VALUES (1, 2)",
  ]);

  await client.batch(migrations.slice(10).flatMap(({ sql }) => sql));

  const { rows } = await client.execute(
    "SELECT terms.parent_id, terms.version, terms.updated_at > 0 AS backfilled, entry_term.entry_id FROM terms JOIN entry_term ON entry_term.term_id = terms.id WHERE terms.id = 2",
  );
  expect(rows).toMatchObject([
    { parent_id: 1, version: 7, backfilled: 1, entry_id: 1 },
  ]);
});

describe("terms.version", () => {
  // The token a guarded write checks: a write that skips the helpers must
  // still move it, or an open copy would overwrite that write unnoticed.
  test("a direct update that leaves it out still moves it by one", async () => {
    const db = await createTestDb();
    const term = await factoriesFor(db).term.create({ version: 4 });

    const [row] = await db
      .update(terms)
      .set({ name: "Edited directly" })
      .where(eq(terms.id, term.id))
      .returning({ version: terms.version });

    expect(row?.version).toBe(5);
  });
});
