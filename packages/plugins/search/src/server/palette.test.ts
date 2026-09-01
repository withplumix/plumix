import { defineEntryContent } from "plumix/blocks";
import { eq, sql } from "plumix/db";
import { entries } from "plumix/schema";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { PaletteGroup, SearchHarness } from "../test/db.js";
import { search } from "../index.js";
import { contentPlugin, createSearchHarness, paragraph } from "../test/db.js";

let h: SearchHarness["h"];
let admin: SearchHarness["admin"];
let palette: SearchHarness["palette"];
let runSchedule: SearchHarness["runSchedule"];

beforeEach(async () => {
  ({ h, admin, palette, runSchedule } = await createSearchHarness({
    plugins: [contentPlugin, search()],
  }));
});

/** Seed an entry, and index it the way the scheduled run does. */
async function seed(
  overrides: Record<string, unknown> = {},
): Promise<{ id: number }> {
  const entry = await h.factory.entry.create({
    authorId: admin.id,
    status: "published",
    publishedAt: new Date(),
    ...overrides,
  });
  await runSchedule();
  return entry;
}

/** An entry whose only mention of `word` is in the middle of its body. */
const withBody = (word: string, overrides: Record<string, unknown> = {}) =>
  seed({
    title: "Notes from the greenhouse",
    content: defineEntryContent([
      paragraph(`<p>Growing lettuce with <em>${word}</em> in winter</p>`),
    ]),
    ...overrides,
  });

const titles = (groups: readonly PaletteGroup[], key: string) =>
  groups.find((group) => group.key === key)?.items.map((item) => item.title);

/** Move an entry to the front of the "most recently edited" order. */
const touch = (id: number) =>
  h.db.update(entries).set({ updatedAt: new Date() }).where(eq(entries.id, id));

describe("the admin command palette", () => {
  test("finds a word from the middle of an entry's body", async () => {
    await withBody("hydroponics", { slug: "greenhouse" });

    expect(titles(await palette("hydroponics"), "entry:post")).toEqual([
      "Notes from the greenhouse",
    ]);
  });

  test("puts the best match first, not the most recently edited", async () => {
    await seed({ title: "Hydroponics", slug: "exact" });
    const passing = await withBody("hydroponics", { slug: "passing" });
    await touch(passing.id);

    expect(titles(await palette("hydroponics"), "entry:post")).toEqual([
      "Hydroponics",
      "Notes from the greenhouse",
    ]);
  });

  test("groups the ranked results per entry type", async () => {
    await withBody("hydroponics", { slug: "p" });
    await withBody("hydroponics", { type: "ledger", slug: "l" });

    const groups = await palette("hydroponics");

    expect(groups.map((group) => group.key)).toEqual([
      "entry:post",
      "entry:ledger",
    ]);
  });

  test("finds an entry type hidden from public search", async () => {
    await withBody("hydroponics", { type: "ledger", slug: "l" });

    expect(titles(await palette("hydroponics"), "entry:ledger")).toEqual([
      "Notes from the greenhouse",
    ]);
  });

  test("shows an author their own draft and nobody else's", async () => {
    const author = await h.seedUser("author");
    await withBody("hydroponics", { status: "draft", slug: "theirs" });
    await withBody("hydroponics", {
      authorId: author.id,
      status: "draft",
      title: "My own greenhouse",
      slug: "mine",
    });

    const groups = await palette("hydroponics", author);

    expect(titles(groups, "entry:post")).toEqual(["My own greenhouse"]);
  });

  test("never shows a trashed entry", async () => {
    await withBody("hydroponics", { status: "trash", slug: "t" });

    expect(await palette("hydroponics")).toEqual([]);
  });

  test("does not rank body text for a caller who cannot edit the type", async () => {
    // `entry:<type>:read` is the subscriber tier, so on a site with open
    // signup every reader holds it. A ranked hit says a word is somewhere
    // inside an entry, which is more than core's title match ever said.
    const reader = await h.seedUser("subscriber");
    await withBody("hydroponics", { slug: "body" });
    await seed({ title: "Hydroponics", slug: "title" });

    expect(titles(await palette("hydroponics", reader), "entry:post")).toEqual([
      "Hydroponics",
    ]);
  });

  test("core's matches fill a group the index holds only part of", async () => {
    // The state a site is in between installing the plugin and rebuilding:
    // one entry has been through the drain, the rest have no document.
    await seed({ title: "Hydroponics indexed", slug: "a" });
    await h.factory.entry.create({
      authorId: admin.id,
      status: "published",
      publishedAt: new Date(),
      title: "Hydroponics unindexed",
      slug: "b",
    });

    expect(titles(await palette("hydroponics"), "entry:post")).toEqual([
      "Hydroponics indexed",
      "Hydroponics unindexed",
    ]);
  });

  test("leaves out a word the editor ruled out", async () => {
    // Body-only matches, so this is the ranked query answering and not core's
    // — which has always read `-word` as an exclusion.
    await seed({
      title: "Greenhouse one",
      slug: "a",
      content: defineEntryContent([paragraph("<p>hydroponics, lettuce</p>")]),
    });
    await seed({
      title: "Greenhouse two",
      slug: "b",
      content: defineEntryContent([paragraph("<p>hydroponics, basil</p>")]),
    });

    expect(titles(await palette("hydroponics -lettuce"), "entry:post")).toEqual(
      ["Greenhouse two"],
    );
  });

  test("still answers mid-word, where whole-term matching cannot", async () => {
    // The index matches whole terms, so an editor part-way through a word is
    // answered by core's substring match rather than by nothing.
    await seed({ title: "Hydroponics", slug: "h" });

    expect(titles(await palette("hydro"), "entry:post")).toEqual([
      "Hydroponics",
    ]);
  });

  test("falls back to core's matches when the index is missing", async () => {
    await seed({ title: "Hydroponics", slug: "h" });
    await h.db.run(sql`DROP TABLE search_index`);
    // Quietly: the search page says it out loud and repairs the index, and a
    // palette that logged would log once per keystroke.
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(titles(await palette("hydroponics"), "entry:post")).toEqual([
      "Hydroponics",
    ]);
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
