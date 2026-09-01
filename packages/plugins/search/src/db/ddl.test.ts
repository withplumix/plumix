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

describe("a repair that did not finish", () => {
  test("rebuilds an index whose objects exist but hold nothing", async () => {
    // Creating the table and filling it are two statements, and the second is
    // the expensive one — so an isolate can die between them. All four objects
    // are then present, which is what a check on `sqlite_master` alone asks,
    // and the index stays empty for good: search answers nothing and the next
    // update to a row it never held raises SQLITE_CORRUPT.
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
  /** What drizzle wraps a failed statement in: the SQL, then the parameters. */
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
    // Drizzle's wrapper repeats the failing SQL — which names `search_index`
    // in every query here — and then the bound parameters, which are the
    // visitor's own words. Reading it would let anyone searching for this
    // phrase have a differently broken schema answered as a degraded page,
    // and start a rebuild per request while they did it.
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
