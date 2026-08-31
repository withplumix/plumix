import type { AppContext, MutablePluginRegistry } from "plumix/plugin";
import { defineEntryContent } from "plumix/blocks";
import { factoriesFor } from "plumix/test";
import { beforeEach, describe, expect, test } from "vitest";

import type { SearchTestDb } from "../test/db.js";
import { createSearchContext, paragraph } from "../test/db.js";
import { indexEntries, indexTerms } from "./index-writer.js";
import { runSearch } from "./query.js";

let db: SearchTestDb;
let ctx: AppContext;
let plugins: MutablePluginRegistry;
let authorId: number;

beforeEach(async () => {
  ({ db, ctx, plugins, authorId } = await createSearchContext());
});

/** Seed one published entry and put it in the index. */
async function publish(
  overrides: Record<string, unknown> = {},
): Promise<{ id: number }> {
  const entry = await factoriesFor(db).entry.create({
    authorId,
    status: "published",
    publishedAt: new Date(),
    ...overrides,
  });
  await indexEntries(ctx, [entry.id]);
  return entry;
}

const search = (query: string, page = 1) =>
  runSearch(ctx, { query, page, perPage: 2 });

// A small page, so the planner's "can the walk reach a full page" question
// has an answer a handful of seeded entries can give.
const searchAt = (query: string, commonTermThreshold: number) =>
  runSearch(ctx, { query, page: 1, perPage: 2, commonTermThreshold });

/** Ordered oldest first, so recency and relevance disagree by construction. */
async function publishSeries(
  titles: readonly string[],
): Promise<readonly number[]> {
  const ids: number[] = [];
  for (const [index, title] of titles.entries()) {
    const entry = await publish({
      title,
      slug: `s${String(index)}`,
      publishedAt: new Date(2020 + index, 0, 1),
    });
    ids.push(entry.id);
  }
  return ids;
}

describe("runSearch", () => {
  test("finds an article by a word from the middle of its body", async () => {
    const entry = await publish({
      title: "Notes from the greenhouse",
      slug: "greenhouse",
      content: defineEntryContent([
        paragraph("<p>Growing lettuce with <em>hydroponics</em> in winter</p>"),
      ]),
    });

    const { results } = await search("hydroponics");

    expect(results.map((result) => result.id)).toEqual([entry.id]);
  });

  test("ranks a title match above a body-only match", async () => {
    const body = await publish({
      title: "Notes from the greenhouse",
      slug: "greenhouse",
      content: defineEntryContent([
        paragraph("<p>a long passing mention of hydroponics among words</p>"),
      ]),
    });
    const title = await publish({
      title: "Hydroponics, a guide",
      slug: "guide",
      content: defineEntryContent([
        paragraph("<p>a long body of other words</p>"),
      ]),
    });

    const { results } = await search("hydroponics");

    expect(results.map((result) => result.id)).toEqual([title.id, body.id]);
  });

  test("a result says what it is, what it is called and where it lives", async () => {
    const entry = await publish({
      title: "Winter hydroponics",
      slug: "winter-hydroponics",
    });

    const [result] = (await search("hydroponics")).results;

    expect(result).toMatchObject({
      kind: "entry",
      id: entry.id,
      title: "Winter hydroponics",
      url: "/post/winter-hydroponics",
    });
    expect(result?.snippet).toContain("<mark>");
  });

  test("a topic says what it is, what it is called and where it lives", async () => {
    const term = await factoriesFor(db).term.create({
      taxonomy: "category",
      name: "Hydroponics",
      slug: "hydroponics",
    });
    await indexTerms(ctx, [term.id]);

    const [result] = (await search("hydroponics")).results;

    expect(result).toMatchObject({
      kind: "term",
      id: term.id,
      title: "Hydroponics",
      url: "/category/hydroponics",
    });
  });

  test("a topic is found by the description its archive carries", async () => {
    const term = await factoriesFor(db).term.create({
      taxonomy: "category",
      name: "Growing",
      slug: "growing",
      description: "Everything about hydroponics indoors",
    });
    await indexTerms(ctx, [term.id]);

    expect((await search("hydroponics")).results).toMatchObject([
      { kind: "term", id: term.id },
    ]);
  });

  test("entries and terms come back in one ranked list", async () => {
    // The term's name is the whole of its text, so bm25 puts it above an
    // article that mentions the word once — which only means anything if the
    // two were ranked against each other rather than merged after the fact.
    const entry = await publish({
      title: "An article mentioning hydroponics once, among many other words",
      slug: "article",
    });
    const term = await factoriesFor(db).term.create({
      taxonomy: "category",
      name: "Hydroponics",
      slug: "hydroponics",
    });
    await indexTerms(ctx, [term.id]);

    const { results } = await search("hydroponics");

    expect(results.map((result) => [result.kind, result.id])).toEqual([
      ["term", term.id],
      ["entry", entry.id],
    ]);
    // One list, one scale: every result was scored by the same query.
    expect(results.every((result) => result.score !== null)).toBe(true);
  });

  test("a term of an excluded taxonomy is clamped out at read time", async () => {
    const term = await factoriesFor(db).term.create({
      taxonomy: "category",
      name: "Hydroponics",
      slug: "hydroponics",
    });
    await indexTerms(ctx, [term.id]);

    plugins.termTaxonomies.set("category", {
      name: "category",
      registeredBy: "test",
      label: "Categories",
      excludeFromSearch: true,
    });

    // Still in the projection, because nothing has touched it — and still
    // absent from results. This is the read clamp, not the write one.
    expect((await search("hydroponics")).results).toEqual([]);
  });

  test("never surfaces a draft, a scheduled entry or a trashed one", async () => {
    const published = await publish({ title: "Hydroponics live", slug: "a" });
    for (const status of ["draft", "scheduled", "trash"] as const) {
      const entry = await factoriesFor(db).entry.create({
        authorId,
        status,
        title: `Hydroponics ${status}`,
        slug: status,
        publishedAt: status === "scheduled" ? new Date(Date.now() + 1e6) : null,
      });
      await indexEntries(ctx, [entry.id]);
    }

    const { results } = await search("hydroponics");

    expect(results.map((result) => result.id)).toEqual([published.id]);
  });

  test("a malformed query comes back empty rather than throwing", async () => {
    await publish({ title: "Hydroponics", slug: "a" });

    for (const query of ['"', 'unbalanced "quote', "*", "NEAR(", "^", ""]) {
      await expect(search(query), query).resolves.toMatchObject({
        results: [],
      });
    }
  });

  test("pages through the results with an opaque cursor", async () => {
    for (let i = 0; i < 5; i += 1) {
      await publish({
        title: `Hydroponics ${String(i)}`,
        slug: `a${String(i)}`,
      });
    }

    const first = await search("hydroponics");
    expect(first.results).toHaveLength(2);
    expect(first.hasMore).toBe(true);

    const second = await search("hydroponics", 2);
    expect(second.results).toHaveLength(2);
    expect(second.results.map((result) => result.id)).not.toEqual(
      first.results.map((result) => result.id),
    );

    const last = await search("hydroponics", 3);
    expect(last.results).toHaveLength(1);
    expect(last.hasMore).toBe(false);
    expect(last.outOfRange).toBe(false);
  });

  test("a word in nearly every document is answered newest first", async () => {
    // bm25 over a word almost everything holds cannot tell one document from
    // another, so recency is the better answer — and the one that does not
    // cost a score per match.
    const ids = await publishSeries([
      "common one",
      "common two",
      "common three",
      "common four",
    ]);

    const { results } = await searchAt("common", 2);

    // The two newest, newest first — not the two bm25 liked best.
    expect(results.map((result) => result.id)).toEqual([ids[3], ids[2]]);
    expect(results.every((result) => result.score === null)).toBe(true);
  });

  test("a selective term is still answered by relevance", async () => {
    const ids = await publishSeries([
      "hydroponics in the title",
      "an unrelated piece",
      "a passing mention of hydroponics among many other words entirely",
    ]);

    const { results } = await searchAt("hydroponics", 2);

    // Oldest first: the title match wins on relevance despite being oldest.
    expect(results.map((result) => result.id)).toEqual([ids[0], ids[2]]);
    expect(results.every((result) => result.score !== null)).toBe(true);
  });

  test("a page past the end is out of range, not an empty page", async () => {
    await publish({ title: "Hydroponics", slug: "a" });

    expect(await search("hydroponics", 2)).toMatchObject({ outOfRange: true });
  });

  test("a page number no database can be asked for is out of range", async () => {
    // `:page` is a `\d+` capture, so a crawler can mint an offset past
    // SQLite's integer range — which errors rather than returning nothing.
    await publish({ title: "Hydroponics", slug: "a" });

    for (const page of [1e20, 0, -1, Number.NaN]) {
      await expect(
        search("hydroponics", page),
        String(page),
      ).resolves.toMatchObject({ results: [] });
    }
  });

  test("an entry type under an access policy is never searchable", async () => {
    // A snippet is body text around a word the visitor chose, so indexing a
    // gated type would hand an anonymous reader its prose a query at a time.
    plugins.entryTypes.set("members", {
      name: "members",
      registeredBy: "test",
      label: "Members",
      access: {
        default: {
          segments: [],
          resolve: () => ({ type: "challenge" as const, kind: "paywall" }),
        },
      },
    });
    const entry = await factoriesFor(db).entry.create({
      authorId,
      type: "members",
      status: "published",
      publishedAt: new Date(),
      title: "Hydroponics for members",
      slug: "m",
    });
    await indexEntries(ctx, [entry.id]);

    expect((await search("hydroponics")).results).toEqual([]);
  });
});
