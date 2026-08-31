import type { User } from "plumix/schema";
import type { DispatcherHarness } from "plumix/test";
import { eq, sql } from "plumix/db";
import { definePlugin, runScheduledTasks } from "plumix/plugin";
import { entries } from "plumix/schema";
import { createDispatcherHarness, createTestContext } from "plumix/test";
import { beforeEach, describe, expect, test } from "vitest";

import { search } from "./index.js";
import {
  applySearchSchema,
  assertIndexIntact,
  indexedSourceIds,
  watchRewrites,
} from "./test/db.js";

// The entry type the site under test publishes. Registered by a plugin
// because that is the only way a type exists — core registers none.
const content = definePlugin("content", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryType("ledger", {
      label: "Ledger",
      excludeFromSearch: true,
    });
  },
});

let h: DispatcherHarness;
let admin: User;

beforeEach(async () => {
  h = await createDispatcherHarness({ plugins: [content, search()] });
  await applySearchSchema(h.db);
  admin = await h.seedUser("admin");
});

/** Post an oRPC procedure the way the admin's client does. */
async function rpc(
  procedure: string,
  input: Record<string, unknown>,
): Promise<void> {
  const response = await h.fetch(`/_plumix/rpc/${procedure}`, {
    method: "POST",
    json: { json: input },
    as: admin,
  });
  response.assertStatus(200);
}

const matches = (term: string) => indexedSourceIds(h.db, term);

/** Everything the scheduled trigger runs, against this harness's database. */
async function runSchedule(): Promise<void> {
  await runScheduledTasks(
    h.app,
    createTestContext({
      db: h.db,
      plugins: h.app.plugins,
      blocks: h.app.blocks,
      hooks: h.app.hooks,
    }),
  );
}

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
