import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { definePlugin } from "../../src/plugin/define.js";
import { upsertAutosave } from "../../src/revisions/repository.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryType("story", {
      label: "Stories",
      supports: ["autosave"],
    });
  },
});

const site = await testSite({ plugins: [posts] });

/** No plugin registers `acme/hero`, as after its plugin is uninstalled. */
const orphan = { id: "hero1", name: "acme/hero", attrs: { title: "Hi" } };

function text(id: string, body = "<p>Hello</p>") {
  return { id, name: "core/rich-text", attrs: { body } };
}

function v2(blocks: readonly unknown[]) {
  return { version: "plumix.v2" as const, blocks };
}

describe("saving an entry that holds a block no plugin registers", () => {
  test("keeps that block's node unchanged", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      content: v2([orphan, text("p1")]),
    });
    const content = v2([orphan, text("p1", "<p>Edited</p>")]);

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(content);
  });

  test("refuses a new node of that block", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      content: v2([orphan, text("p1")]),
    });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      content: v2([orphan, { id: "hero2", name: "acme/hero", attrs: {} }]),
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "unknown_block_type",
            path: "blocks[1]",
          }),
        ],
      },
    });
  });

  test("refuses its stored id used twice", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      content: v2([orphan, text("p1")]),
    });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      content: v2([orphan, orphan]),
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "unknown_block_type",
            path: "blocks[1]",
          }),
        ],
      },
    });
  });

  test("refuses its stored id under another block name", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      content: v2([orphan, text("p1")]),
    });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      content: v2([{ ...orphan, name: "acme/other" }]),
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
    });
  });

  test("keeps its stored node moved into another parent among new siblings", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      content: v2([orphan, text("p1")]),
    });
    const content = v2([
      text("p0"),
      {
        id: "g1",
        name: "core/group",
        attrs: { content: [text("p2"), orphan, text("p3")] },
      },
    ]);

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(content);
  });

  test("keeps a node only the caller's autosave holds", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.published.create({
      authorId: author.id,
      type: "story",
      content: v2([text("p1")]),
    });
    await upsertAutosave(site.context.db, {
      entry: own,
      authorId: author.id,
      patch: {
        title: own.title,
        content: v2([orphan, text("p1")]),
        excerpt: null,
        meta: {},
        metaDeletes: [],
      },
    });
    const content = v2([text("p1"), orphan]);

    const draft = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(draft.content).toEqual(content);
  });
});
