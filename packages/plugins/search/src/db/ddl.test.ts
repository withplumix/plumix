import { eq, sql } from "plumix/db";
import { describe, expect, test } from "vitest";

import type { SearchTestDb } from "../test/db.js";
import {
  assertIndexIntact,
  createSearchTestDb,
  dropSearchIndex,
  indexedSourceIds,
} from "../test/db.js";
import {
  ensureSearchIndex,
  isMissingSearchIndex,
  SEARCH_INDEX_DDL,
} from "./ddl.js";
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
    // Keeps a roster change from re-tokenizing the corpus. Asserted against
    // the installed definition, since a spy trigger written the same way
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
    // Creating the objects alone leaves an empty index whose
    // `integrity-check` passes and whose next update raises SQLITE_CORRUPT.
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

describe("a repair that did not finish", () => {
  test("rebuilds an index whose objects exist but hold nothing", async () => {
    // An isolate can die between creating the table and filling it, leaving
    // every object in `sqlite_master` but an index that stays empty for good.
    const db = await createSearchTestDb();
    await dropSearchIndex(db);
    await db.insert(searchDocuments).values(document(1, "Hydroponics"));
    for (const statement of SEARCH_INDEX_DDL) await db.run(sql.raw(statement));

    await ensureSearchIndex(db);

    expect(await indexedSourceIds(db, "hydroponics")).toEqual([1]);
    await assertIndexIntact(db);
  });

  test("leaves a populated index alone", async () => {
    // The other half of the same question: an index that legitimately holds
    // nothing because the projection does must not rebuild on every call.
    const db = await createSearchTestDb();
    await db.insert(searchDocuments).values(document(1, "Hydroponics"));

    await ensureSearchIndex(db);
    await ensureSearchIndex(db);

    expect(await indexedSourceIds(db, "hydroponics")).toEqual([1]);
    await assertIndexIntact(db);
  });
});

describe("isMissingSearchIndex", () => {
  // What drizzle wraps a failed statement in: the SQL, then the parameters.
  const asDrizzleWould = (cause: Error, params: string) =>
    new Error(
      `Failed query: SELECT 1 FROM search_index WHERE search_index MATCH ?\nparams: ${params}`,
      { cause },
    );

  test("recognises the fault however the driver phrases it", () => {
    for (const message of [
      "SQLITE_ERROR: no such table: search_index",
      "D1_ERROR: no such table: search_index: SQLITE_ERROR",
      "no such table: main.search_index",
    ]) {
      expect(
        isMissingSearchIndex(asDrizzleWould(new Error(message), '"x"')),
        message,
      ).toBe(true);
    }
  });

  test("a visitor cannot type their way to a missing index", () => {
    // The wrapper's parameters are the visitor's words, so matching on it
    // would let a search phrase trigger a degraded page and a rebuild per
    // request.
    const other = new Error("SQLITE_ERROR: no such table: search_documents");

    expect(
      isMissingSearchIndex(
        asDrizzleWould(other, '"no such table: search_index"'),
      ),
    ).toBe(false);
  });

  test("gives up rather than following a cause back to itself", () => {
    const looping: Error & { cause?: unknown } = new Error("boom");
    looping.cause = looping;

    expect(isMissingSearchIndex(looping)).toBe(false);
  });
});
