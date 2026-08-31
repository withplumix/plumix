import type { User } from "plumix/schema";
import type { DispatcherHarness } from "plumix/test";
import { eq, sql } from "plumix/db";
import { entries } from "plumix/schema";
import { beforeEach, describe, expect, test } from "vitest";

import type { SearchHarness } from "./test/db.js";
import { search } from "./index.js";
import {
  assertIndexIntact,
  contentPlugin,
  createSearchHarness,
  indexedSourceIds,
  watchRewrites,
} from "./test/db.js";

let h: DispatcherHarness;
let admin: User;
let runSchedule: () => Promise<void>;
let rpc: SearchHarness["rpc"];

beforeEach(async () => {
  ({ h, admin, rpc, runSchedule } = await createSearchHarness({
    plugins: [contentPlugin, search()],
  }));
});

const matches = (term: string) => indexedSourceIds(h.db, term);

describe("search()", () => {
  test("an entry saved through the application is indexed with no scheduled run", async () => {
    await rpc("entry/create", {
      title: "Hydroponics in winter",
      slug: "hydroponics",
      status: "published",
    });

    await h.drainDeferred();

    expect(await matches("hydroponics")).toHaveLength(1);
  });

  test("a save the index cannot absorb still succeeds, and stays on the feed", async () => {
    // The response is never held up by the indexing, so a failure in it
    // cannot reach the editor — the save is what the request answered for.
    // The change stays on the feed, for the next drain to retry.
    await h.db.run(sql`DROP TABLE search_documents`);

    await rpc("entry/create", {
      title: "Hydroponics in winter",
      slug: "hydroponics",
      status: "published",
    });
    await h.drainDeferred();

    expect(await h.db.all(sql`SELECT id FROM entry_changes`)).toHaveLength(1);
  });

  test("a term that predates the plugin is indexed on a scheduled run", async () => {
    // Terms have no change feed, so nothing would ever reach one a site
    // already had — the lifecycle actions only fire for a term somebody
    // touches.
    const term = await h.factory.term.create({
      taxonomy: "category",
      name: "Hydroponics",
      slug: "hydroponics",
    });

    expect(await matches("hydroponics")).toEqual([]);

    await runSchedule();

    expect(await matches("hydroponics")).toEqual([term.id]);
  });

  test("a term of a taxonomy hidden from the site is never backfilled", async () => {
    await h.factory.term.create({
      taxonomy: "nav-menu",
      name: "Hydroponics menu",
      slug: "hydroponics-menu",
    });

    await runSchedule();

    expect(await matches("hydroponics")).toEqual([]);
  });

  test("an entry written straight to the database is indexed once the feed drains", async () => {
    const entry = await h.factory.entry.create({
      authorId: admin.id,
      title: "Hydroponics in winter",
      status: "published",
    });

    expect(await matches("hydroponics")).toEqual([]);

    await runSchedule();

    expect(await matches("hydroponics")).toEqual([entry.id]);
  });

  test("deleting an entry takes it out of the index", async () => {
    const entry = await h.factory.entry.create({
      authorId: admin.id,
      title: "Hydroponics in winter",
    });
    await runSchedule();

    await rpc("entry/trash", { id: entry.id });
    await rpc("entry/deletePermanent", { id: entry.id });
    await h.drainDeferred();

    expect(await matches("hydroponics")).toEqual([]);
    await assertIndexIntact(h.db);
  });

  test("an entry type excluded from search never reaches the index", async () => {
    await h.factory.entry.create({
      authorId: admin.id,
      type: "ledger",
      title: "Hydroponics ledger",
    });

    await runSchedule();

    expect(await matches("hydroponics")).toEqual([]);
  });

  test("a save that leaves the text alone does not re-tokenize the entry", async () => {
    const entry = await h.factory.entry.create({
      authorId: admin.id,
      title: "Hydroponics in winter",
      slug: "hydroponics",
    });
    await runSchedule();
    const rewrites = await watchRewrites(h.db);

    await rpc("entry/update", { id: entry.id, sortOrder: 7 });
    await h.drainDeferred();
    await runSchedule();

    expect(await rewrites()).toEqual([]);
    expect(await matches("hydroponics")).toEqual([entry.id]);
  });

  test("editing an entry's body replaces what it matches", async () => {
    const entry = await h.factory.entry.create({
      authorId: admin.id,
      title: "Hydroponics in winter",
      slug: "hydroponics",
    });
    await runSchedule();

    await rpc("entry/update", { id: entry.id, title: "Aquaponics in winter" });
    await h.drainDeferred();

    expect(await matches("hydroponics")).toEqual([]);
    expect(await matches("aquaponics")).toEqual([entry.id]);
    await assertIndexIntact(h.db);
  });

  test("the feed is empty once a drain has run", async () => {
    await h.factory.entry.create({ authorId: admin.id, title: "One" });
    await h.factory.entry.create({ authorId: admin.id, title: "Two" });

    await runSchedule();

    expect(await h.db.all(sql`SELECT id FROM entry_changes`)).toEqual([]);
  });

  test("an entry deleted straight from the database leaves the index", async () => {
    const entry = await h.factory.entry.create({
      authorId: admin.id,
      title: "Hydroponics in winter",
    });
    await runSchedule();

    await h.db.delete(entries).where(eq(entries.id, entry.id));
    await runSchedule();

    expect(await matches("hydroponics")).toEqual([]);
    await assertIndexIntact(h.db);
  });
});
