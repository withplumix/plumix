import { eq, sql } from "plumix/db";
import { describe, expect, test } from "vitest";

import type { SearchTestDb } from "../test/db.js";
import {
  assertIndexIntact,
  createSearchTestDb,
  indexedSourceIds,
} from "../test/db.js";
import { ensureSearchIndex } from "./ddl.js";
import { searchDocuments } from "./schema.js";

const document = (sourceId: number, title: string) => ({
  sourceType: "entry" as const,
  sourceId,
  title,
  body: "",
  extractorVersion: "v1",
});

/** What SQLite says the update trigger actually is. */
async function updateTriggerSql(db: SearchTestDb): Promise<string> {
  const [row] = await db.all<{ sql: string }>(
    sql`SELECT sql FROM sqlite_master WHERE name = 'search_documents_au'`,
  );
  return row?.sql ?? "";
}

describe("the index triggers", () => {
  test("the update trigger watches only the columns the index shadows", async () => {
    // The whole of what keeps a block roster change from re-tokenizing the
    // corpus: stamping a document with a new extractor version is a write to
    // the projection and must not be a write to the index. Asserted against
    // the installed definition, because a spy trigger written the same way
    // would agree with a wrong one.
    const db = await createSearchTestDb();

    expect(await updateTriggerSql(db)).toContain("UPDATE OF title, body");
  });

  test("replaces a trigger left behind by the first version", async () => {
    // An install that ran the first migration carries an unscoped trigger,
    // and `CREATE TRIGGER IF NOT EXISTS` would leave it there.
    const db = await createSearchTestDb();
    await db.run(sql`DROP TRIGGER search_documents_au`);
    await db.run(sql`
      CREATE TRIGGER search_documents_au AFTER UPDATE ON search_documents
      BEGIN
        INSERT INTO search_index (search_index, rowid, title, body)
        VALUES ('delete', old.id, old.title, old.body);
        INSERT INTO search_index (rowid, title, body)
        VALUES (new.id, new.title, new.body);
      END
    `);

    await ensureSearchIndex(db);

    expect(await updateTriggerSql(db)).toContain("UPDATE OF title, body");
  });
});

describe("ensureSearchIndex", () => {
  test("leaves an index that is already there alone", async () => {
    const db = await createSearchTestDb();
    await db.insert(searchDocuments).values(document(1, "Hydroponics"));

    await ensureSearchIndex(db);

    expect(await indexedSourceIds(db, "hydroponics")).toEqual([1]);
  });

  test("rebuilds an index recreated over a projection that outlived it", async () => {
    // The install whose raw migration never ran: the projection is written
    // for a while with no index behind it. Creating the objects alone leaves
    // an empty index whose `integrity-check` passes and whose next update
    // raises SQLITE_CORRUPT, so the repair has to repopulate.
    const db = await createSearchTestDb();
    await db.run(sql`DROP TRIGGER search_documents_ai`);
    await db.run(sql`DROP TRIGGER search_documents_au`);
    await db.run(sql`DROP TRIGGER search_documents_ad`);
    await db.run(sql`DROP TABLE search_index`);
    await db.insert(searchDocuments).values(document(1, "Hydroponics"));

    await ensureSearchIndex(db);

    expect(await indexedSourceIds(db, "hydroponics")).toEqual([1]);
    await db
      .update(searchDocuments)
      .set({ title: "Aquaponics" })
      .where(eq(searchDocuments.sourceId, 1));
    expect(await indexedSourceIds(db, "aquaponics")).toEqual([1]);
    await assertIndexIntact(db);
  });
});
