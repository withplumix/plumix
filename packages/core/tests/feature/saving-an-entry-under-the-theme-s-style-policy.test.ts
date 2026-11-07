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

const site = await testSite({
  plugins: [posts],
  config: {
    theme: {
      ...defaultTestTheme,
      allowCustomStyles: false,
      tokens: { color: { primary: { value: "#06f" } } },
    },
  },
});

function text(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: "core/rich-text",
    attrs: { body: "<p>Hello</p>" },
    ...extra,
  };
}

function v2(blocks: readonly unknown[]) {
  return { version: "plumix.v2" as const, blocks };
}

/** An entry stored before the theme forbade its literal colour. */
async function holdingLiteral() {
  const author = await site.factory.author.create();
  const own = await site.factory.draft.create({
    authorId: author.id,
    content: v2([text("p1", { style: { large: { color: "#e11" } } })]),
  });
  return { author, own };
}

describe("saving an entry under a theme that forbids custom styles", () => {
  test.each([
    [
      "a new literal",
      text("p2", { style: { large: { color: "#f00" } } }),
      "color",
    ],
    [
      "an undeclared token",
      text("p2", {
        style: { large: { color: "var(--plumix-color-gone, #f00)" } },
      }),
      "color",
    ],
    [
      "a new Custom CSS declaration",
      text("p2", { style: { large: { transform: "rotate(3deg)" } } }),
      "transform",
    ],
    ["a new class name", text("p2", { className: "brand-red" }), "className"],
  ])("refuses %s", async (_, added, property) => {
    const { author, own } = await holdingLiteral();

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      content: v2([text("p1", { style: { large: { color: "#e11" } } }), added]),
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "style_not_allowed",
            path: "blocks[1]",
            property,
          }),
        ],
      },
    });
  });

  test("refuses a stored forbidden literal changed to another", async () => {
    const { author, own } = await holdingLiteral();

    const update = site.actingAs(author).rpc.entry.update({
      id: own.id,
      content: v2([text("p1", { style: { large: { color: "#f00" } } })]),
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "style_not_allowed",
            path: "blocks[0]",
          }),
        ],
      },
    });
  });

  test("keeps a stored literal moved with its block", async () => {
    const { author, own } = await holdingLiteral();
    const content = v2([
      {
        id: "g1",
        name: "core/group",
        attrs: {
          content: [text("p1", { style: { large: { color: "#e11" } } })],
        },
      },
    ]);

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(content);
  });

  test("saves a cleared literal", async () => {
    const { author, own } = await holdingLiteral();
    const content = v2([text("p1")]);

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(content);
  });

  test("saves a block's defaultStyles values", async () => {
    const { author, own } = await holdingLiteral();
    const content = v2([
      {
        id: "s1",
        name: "core/section",
        attrs: { content: [] },
        style: { large: { paddingTop: "3rem", paddingBottom: "3rem" } },
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
