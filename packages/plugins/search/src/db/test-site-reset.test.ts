import { sql } from "plumix/db";
import { testSite } from "plumix/test";
import { describe, expect, test } from "vitest";

import { search } from "../index.js";
import { searchDocuments } from "./schema.js";

const site = await testSite({ plugins: [search()] });

async function index(title: string): Promise<void> {
  await site.context.db.insert(searchDocuments).values({
    sourceType: "entry",
    sourceId: 1,
    title,
    body: "",
    extractorVersion: "v1",
  });
}

async function matches(word: string): Promise<unknown[]> {
  return site.context.db.all(
    sql`SELECT rowid FROM search_index WHERE search_index MATCH ${word}`,
  );
}

describe("a test site with the search plugin", () => {
  test("indexes what the first test writes", async () => {
    await index("first");
    await site.context.db.run(
      sql`INSERT INTO search_index (rowid, title, body) VALUES (7, 'stray', '')`,
    );

    expect(await matches("first OR stray")).toEqual([
      { rowid: 1 },
      { rowid: 7 },
    ]);
  });

  test("starts the next test on an empty index that finds a new document", async () => {
    expect(await matches("first OR stray")).toEqual([]);

    await index("second");

    expect(await matches("second")).toEqual([{ rowid: 1 }]);
  });
});
