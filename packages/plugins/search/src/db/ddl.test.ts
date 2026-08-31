import { eq, sql } from "plumix/db";
import { describe, expect, test } from "vitest";

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
