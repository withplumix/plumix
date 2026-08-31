import type { AppContext, MutablePluginRegistry } from "plumix/plugin";
import {
  coreBlocks,
  createBlockRegistry,
  defineEntryContent,
} from "plumix/blocks";
import { eq } from "plumix/db";
import { createPluginRegistry } from "plumix/plugin";
import { entries, terms } from "plumix/schema";
import { createTestContext, factoriesFor } from "plumix/test";
import { beforeEach, describe, expect, test } from "vitest";

import type { SearchTestDb } from "../test/db.js";
import {
  assertIndexIntact,
  createSearchTestDb,
  indexedSourceIds,
  paragraph,
  watchRewrites,
} from "../test/db.js";
import { indexEntries, indexTerms } from "./index-writer.js";

let db: SearchTestDb;
let ctx: AppContext;
let plugins: MutablePluginRegistry;
let authorId: number;

const postType = (overrides: Record<string, unknown> = {}) => ({
  name: "post",
  registeredBy: "test",
  label: "Posts",
  ...overrides,
});

beforeEach(async () => {
  db = await createSearchTestDb();
  plugins = createPluginRegistry();
  plugins.entryTypes.set("post", postType());
  plugins.termTaxonomies.set("category", {
    name: "category",
    registeredBy: "test",
    label: "Categories",
  });
  ctx = createTestContext({
    db,
    plugins,
    blocks: createBlockRegistry([...coreBlocks]),
  });
  const author = await factoriesFor(db).admin.create();
  authorId = author.id;
});

function seed(
  overrides: Record<string, unknown> = {},
): Promise<{ id: number }> {
  return factoriesFor(db).entry.create({ authorId, ...overrides });
}

const matches = (term: string) => indexedSourceIds(db, term);

describe("indexEntries", () => {
  test("makes a word from the middle of an entry's body findable", async () => {
    const entry = await seed({
      content: defineEntryContent([
        paragraph("<p>A note on <em>hydroponics</em> in winter</p>"),
      ]),
    });

    await indexEntries(ctx, [entry.id]);

    expect(await matches("hydroponics")).toEqual([entry.id]);
  });

  test("stems, so a search for the root finds the inflected form", async () => {
    const entry = await seed({ title: "Running late" });

    await indexEntries(ctx, [entry.id]);

    expect(await matches("run")).toEqual([entry.id]);
  });

  test("never indexes an entry type excluded from search", async () => {
    plugins.entryTypes.set("ledger", {
      ...postType({ excludeFromSearch: true }),
      name: "ledger",
      label: "Ledger",
    });
    const entry = await seed({ type: "ledger", title: "Hydroponics ledger" });

    await indexEntries(ctx, [entry.id]);

    expect(await matches("hydroponics")).toEqual([]);
  });

  test("drops an entry that has gone from the database", async () => {
    const entry = await seed({ title: "Hydroponics" });
    await indexEntries(ctx, [entry.id]);

    await db.delete(entries).where(eq(entries.id, entry.id));
    await indexEntries(ctx, [entry.id]);

    expect(await matches("hydroponics")).toEqual([]);
  });

  test("drops an entry whose type stopped being searchable", async () => {
    const entry = await seed({ title: "Hydroponics" });
    await indexEntries(ctx, [entry.id]);

    plugins.entryTypes.set("post", postType({ excludeFromSearch: true }));
    await indexEntries(ctx, [entry.id]);

    expect(await matches("hydroponics")).toEqual([]);
  });

  test("re-indexing an entry whose text has not moved rewrites nothing", async () => {
    const entry = await seed({ title: "Hydroponics" });
    await indexEntries(ctx, [entry.id]);
    const rewrites = await watchRewrites(db);

    await indexEntries(ctx, [entry.id]);

    expect(await rewrites()).toEqual([]);
  });

  test("re-indexing an entry whose text moved replaces what it matches", async () => {
    const entry = await seed({ title: "Hydroponics" });
    await indexEntries(ctx, [entry.id]);

    await db
      .update(entries)
      .set({ title: "Aquaponics" })
      .where(eq(entries.id, entry.id));
    await indexEntries(ctx, [entry.id]);

    expect(await matches("hydroponics")).toEqual([]);
    expect(await matches("aquaponics")).toEqual([entry.id]);
  });

  test("never indexes a taxonomy excluded from search", async () => {
    plugins.termTaxonomies.set("nav-menu", {
      name: "nav-menu",
      registeredBy: "test",
      label: "Menus",
      isPublic: false,
    });
    const term = await factoriesFor(db).term.create({
      taxonomy: "nav-menu",
      name: "Hydroponics menu",
    });

    await indexTerms(ctx, [term.id]);

    expect(await matches("hydroponics")).toEqual([]);
  });

  test("drops a term whose taxonomy stopped being searchable", async () => {
    const term = await factoriesFor(db).term.create({
      taxonomy: "category",
      name: "Hydroponics",
    });
    await indexTerms(ctx, [term.id]);
    expect(await matches("hydroponics")).toEqual([term.id]);

    plugins.termTaxonomies.set("category", {
      name: "category",
      registeredBy: "test",
      label: "Categories",
      excludeFromSearch: true,
    });
    await indexTerms(ctx, [term.id]);

    expect(await matches("hydroponics")).toEqual([]);
  });

  test("drops a term that has gone from the database", async () => {
    const term = await factoriesFor(db).term.create({
      taxonomy: "category",
      name: "Hydroponics",
    });
    await indexTerms(ctx, [term.id]);

    await db.delete(terms).where(eq(terms.id, term.id));
    await indexTerms(ctx, [term.id]);

    expect(await matches("hydroponics")).toEqual([]);
  });

  test("leaves the index intact after a run of updates and deletes", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const entry = await seed({ title: `Entry ${String(i)} hydroponics` });
      ids.push(entry.id);
    }
    await indexEntries(ctx, ids);
    for (const id of ids) {
      await db
        .update(entries)
        .set({ title: `Rewritten ${String(id)}` })
        .where(eq(entries.id, id));
    }
    await indexEntries(ctx, ids);
    await db.delete(entries).where(eq(entries.id, ids[0] ?? 0));
    await indexEntries(ctx, ids);

    await assertIndexIntact(db);
    expect(await matches("rewritten")).toEqual(ids.slice(1));
    expect(await matches("hydroponics")).toEqual([]);
  });
});
