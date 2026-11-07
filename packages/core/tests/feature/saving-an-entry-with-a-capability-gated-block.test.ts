import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const scripts = definePlugin("scripts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    // Inserting it takes `settings:manage`, an admin's.
    ctx.registerBlock({
      name: "test/script",
      render: () => null,
      capability: "settings:manage",
    });
  },
});

const site = await testSite({ plugins: [scripts] });

function script(id: string) {
  return { id, name: "test/script", attrs: {} };
}

function v2(blocks: readonly unknown[]) {
  return { version: "plumix.v2" as const, blocks };
}

describe("saving an entry as a writer who lacks a block's capability", () => {
  test("refuses a new node of that block", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      content: v2([script("s1")]),
    });

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      content: v2([script("s1"), script("s2")]),
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "block_not_allowed",
            path: "blocks[1]",
          }),
        ],
      },
    });
  });

  test("keeps a stored node of that block", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      content: v2([script("s1")]),
    });
    const content = v2([script("s1")]);

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(content);
  });
});
