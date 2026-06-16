import type { AppContext } from "plumix/plugin";
import { createTestDb, factoriesFor } from "plumix/test";
import { describe, expect, test } from "vitest";

import { findRelatedEntries } from "./related.js";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Minimal AppContext stand-in — `findRelatedEntries` reads only `db`. */
function ctxFor(db: TestDb): AppContext {
  return { db } as unknown as AppContext;
}

describe("findRelatedEntries", () => {
  test("returns published posts sharing a term, newest first, current excluded", async () => {
    const db = await createTestDb();
    const f = factoriesFor(db);
    const author = await f.user.create({});
    const topic = await f.term.create({ taxonomy: "category" });
    const other = await f.term.create({ taxonomy: "category" });

    const make = async (
      title: string,
      status: "published" | "draft",
      publishedAt: Date | null,
      termId: number,
      type = "post",
    ) => {
      const entry = await f.entry.create({
        type,
        title,
        status,
        publishedAt,
        authorId: author.id,
      });
      await f.entryTerm.create({ entryId: entry.id, termId });
      return entry;
    };

    const current = await make(
      "Current",
      "published",
      new Date(3000),
      topic.id,
    );
    const newer = await make("Newer", "published", new Date(2000), topic.id);
    const older = await make("Older", "published", new Date(1000), topic.id);
    await make("Draft sibling", "draft", null, topic.id);
    await make("Different topic", "published", new Date(2500), other.id);
    // Shares the term but is a different type — must not surface as related.
    await make("Page sibling", "published", new Date(2200), topic.id, "page");

    const related = await findRelatedEntries(ctxFor(db), current.id);

    expect(related.map((e) => e.title)).toEqual(["Newer", "Older"]);
    expect(related.map((e) => e.id)).toEqual([newer.id, older.id]);
  });

  test("returns nothing when the entry has no terms", async () => {
    const db = await createTestDb();
    const f = factoriesFor(db);
    const author = await f.user.create({});
    const entry = await f.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date(),
      authorId: author.id,
    });

    expect(await findRelatedEntries(ctxFor(db), entry.id)).toEqual([]);
  });
});
