import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { pageNotFound } from "../../src/route/contract/page-outcome.js";
import { testSite } from "../../src/test/site.js";

const feeds = definePlugin("test", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerBlock({
      name: "test/feed",
      render: () => null,
      loaders: {
        // Echoes an attr, so the data proves the loader re-ran against the
        // block's current attrs.
        items: ({ attrs }) => Promise.resolve({ count: attrs.count }),
      },
    });
    ctx.registerBlock({
      name: "test/share",
      render: () => null,
      loaders: { share: () => Promise.reject(pageNotFound()) },
    });
  },
});

const site = await testSite({ plugins: [feeds] });

const feed = (count: number) => ({
  version: "plumix.v2" as const,
  blocks: [{ id: "feed1", name: "test/feed", attrs: { count } }],
});

describe("refreshing a block's loader", () => {
  test("re-runs that block's loader and returns its data", async () => {
    const editor = await site.factory.editor.create();
    const draft = await site.factory.draft.create({
      authorId: editor.id,
      content: feed(7),
    });

    const result = await site
      .actingAs(editor)
      .rpc.entry.refreshBlockLoader({ id: draft.id, blockId: "feed1" });

    expect(result.data).toEqual({ feed1: { items: { count: 7 } } });
  });

  test("leaves out a block whose loader throws a page outcome", async () => {
    const editor = await site.factory.editor.create();
    const draft = await site.factory.draft.create({
      authorId: editor.id,
      content: {
        version: "plumix.v2",
        blocks: [{ id: "share1", name: "test/share", attrs: {} }],
      },
    });

    const result = await site
      .actingAs(editor)
      .rpc.entry.refreshBlockLoader({ id: draft.id, blockId: "share1" });

    // As any rejected loader is: an errored block is left out of the map.
    expect(result.data).toEqual({});
  });

  test("is not found for a block id the entry does not hold", async () => {
    const editor = await site.factory.editor.create();
    const draft = await site.factory.draft.create({
      authorId: editor.id,
      content: feed(1),
    });

    const refresh = site
      .actingAs(editor)
      .rpc.entry.refreshBlockLoader({ id: draft.id, blockId: "nope" });

    await expect(refresh).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("is not found for a draft the caller cannot read", async () => {
    const other = await site.factory.user.create();
    const draft = await site.factory.draft.create({
      authorId: other.id,
      content: feed(1),
    });

    const refresh = site
      .actingAs("author")
      .rpc.entry.refreshBlockLoader({ id: draft.id, blockId: "feed1" });

    await expect(refresh).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
