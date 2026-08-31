import type { AppContext } from "plumix/plugin";
import { createTestContext } from "plumix/test";
import { beforeEach, describe, expect, test } from "vitest";

import type { SearchTestDb } from "../test/db.js";
import { createSearchTestDb, indexWords } from "../test/db.js";
import { planForQuery } from "./query-plan.js";
import { toMatchExpression } from "./query-text.js";

let db: SearchTestDb;
let ctx: AppContext;

const index = (count: number, ...words: string[]) =>
  indexWords(db, count, ...words);

/** Plan a query the way `runSearch` does — compiled, and for a real page. */
const plan = (query: string, threshold: number, needed = 3) =>
  planForQuery(ctx, {
    match: toMatchExpression(query) ?? "",
    types: ["post"],
    needed,
    threshold,
  });

beforeEach(async () => {
  db = await createSearchTestDb();
  ctx = createTestContext({ db });
});

describe("planForQuery", () => {
  test("ranks a selective term by relevance", async () => {
    await index(2, "hydroponics");
    await index(20, "filler");

    expect(await plan("hydroponics", 10)).toBe("ranked");
  });

  test("orders a word in nearly every document by recency instead", async () => {
    await index(20, "common");

    expect(await plan("common", 10)).toBe("recent");
  });

  test("measures through the stem the index stored, not the word typed", async () => {
    // The index is porter-stemmed, so "running" is filed under "run". Counting
    // the match set asks the index the question in its own terms; reading a
    // word's frequency out of the vocabulary would have to guess at them.
    await index(20, "running");

    expect(await plan("running", 10)).toBe("recent");
    expect(await plan("runs", 10)).toBe("recent");
  });

  test("measures a word the tokenizer stripped accents from", async () => {
    await index(20, "cafés");

    expect(await plan("cafes", 10)).toBe("recent");
  });

  test("measures what a query matches, not what its words do apart", async () => {
    // Both words are common; the pair is not. A per-word frequency would read
    // this as common and lose it its ranking — the match set is the truth.
    await index(20, "common ordinary");
    await index(2, "common ordinary hydroponics");

    expect(await plan("common ordinary", 10)).toBe("recent");
    expect(await plan("common hydroponics", 10)).toBe("ranked");
  });

  test("holds a phrase to the adjacency it asks for", async () => {
    await index(20, "winter garden");
    await index(2, "garden winter");

    // Both words are in every document, so only the phrase is selective.
    expect(await plan('"garden winter"', 10)).toBe("ranked");
  });

  test("ranks a query that matches nothing at all", async () => {
    // The plan exists to make a common word fast, never to cost a rare one
    // its relevance ordering.
    await index(20, "common");

    expect(await plan("aquaponics", 10)).toBe("ranked");
  });

  test("takes the threshold it is given", async () => {
    await index(20, "common");

    expect(await plan("common", 25)).toBe("ranked");
    expect(await plan("common", 5)).toBe("recent");
  });

  test("ranks a word the recency walk would never reach", async () => {
    // Common by any count, but every one of them is old — so ordering by date
    // would step over the whole corpus before it had a page. The match set
    // cannot show that; only walking the head can, which is why the corpus
    // here has to be deeper than the walk is allowed to go.
    await index(20, "bygone");
    await index(510, "modern");

    expect(await plan("bygone", 10)).toBe("ranked");
    expect(await plan("modern", 10)).toBe("recent");
  });

  test("ranks a page deeper than the walk is allowed to go", async () => {
    await index(20, "common");

    expect(await plan("common", 10, 2000)).toBe("ranked");
  });
});
