import type { AppContext } from "plumix/plugin";
import { readEntryType } from "plumix";
import {
  createRequestMemo,
  createTestDb,
  createTracedContext,
  factoriesFor,
} from "plumix/test";
import { describe, expect, test } from "vitest";

import { findRelatedEntries } from "./related.js";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Minimal AppContext stand-in — `findRelatedEntries` reads `db` + `memo`. */
function ctxFor(db: TestDb): AppContext {
  return { db, memo: createRequestMemo() } as unknown as AppContext;
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

  test("shares the current entry's type read with earlier consumers in the request", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext();
    const f = harness.factory;
    const author = await f.user.create({});
    const topic = await f.term.create({ taxonomy: "category" });
    const current = await f.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date(2000),
      authorId: author.id,
    });
    const sibling = await f.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date(1000),
      authorId: author.id,
    });
    await f.entryTerm.create({ entryId: current.id, termId: topic.id });
    await f.entryTerm.create({ entryId: sibling.id, termId: topic.id });

    const related = await run(async () => {
      // e.g. the comments plugin's enablement gate, earlier in the render.
      await readEntryType(ctx, current.id);
      const before = dbQueryCount();
      const rows = await findRelatedEntries(ctx, current.id);
      // Terms, sibling ids, and the final list — the type read replays
      // from the request memo instead of re-querying.
      expect(dbQueryCount() - before).toBe(3);
      return rows;
    });

    expect(related.map((e) => e.id)).toEqual([sibling.id]);
  });
});
