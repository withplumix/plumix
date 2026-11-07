import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { definePlugin } from "../../src/plugin/define.js";
import { defaultTestTheme } from "../../src/test/default-theme.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
  },
});

/** `core/rich-text` is registered but outside the theme's list. */
const site = await testSite({
  plugins: [posts],
  config: { theme: { ...defaultTestTheme, allowedBlocks: ["core/group"] } },
});

function text(id: string, body = "<p>Hello</p>") {
  return { id, name: "core/rich-text", attrs: { body } };
}

function v2(blocks: readonly unknown[]) {
  return { version: "plumix.v2" as const, blocks };
}

describe("saving an entry under a theme that allows only some blocks", () => {
  test("refuses a new node of a block outside the set", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      content: v2([text("p1")]),
    });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      content: v2([text("p1"), text("p2")]),
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "block_not_allowed",
            path: "blocks[1]",
            nodeName: "core/rich-text",
          }),
        ],
      },
    });
  });

  test("keeps a stored node of a block outside the set, moved and edited", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      content: v2([text("p1")]),
    });
    const content = v2([
      {
        id: "g1",
        name: "core/group",
        attrs: { content: [text("p1", "<p>Edited</p>")] },
      },
    ]);

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(content);
  });
});
