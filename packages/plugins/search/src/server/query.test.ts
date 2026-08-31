import type { AppContext, MutablePluginRegistry } from "plumix/plugin";
import {
  coreBlocks,
  createBlockRegistry,
  defineEntryContent,
} from "plumix/blocks";
import { createPluginRegistry } from "plumix/plugin";
import { createTestContext, factoriesFor } from "plumix/test";
import { beforeEach, describe, expect, test } from "vitest";

import type { SearchTestDb } from "../test/db.js";
import { createSearchTestDb, paragraph } from "../test/db.js";
import { indexEntries } from "./index-writer.js";
import { runSearch } from "./query.js";

let db: SearchTestDb;
let ctx: AppContext;
let plugins: MutablePluginRegistry;
let authorId: number;

beforeEach(async () => {
  db = await createSearchTestDb();
  plugins = createPluginRegistry();
  plugins.entryTypes.set("post", {
    name: "post",
    registeredBy: "test",
    label: "Posts",
  });
  ctx = createTestContext({
    db,
    plugins,
    blocks: createBlockRegistry([...coreBlocks]),
  });
  authorId = (await factoriesFor(db).admin.create()).id;
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
