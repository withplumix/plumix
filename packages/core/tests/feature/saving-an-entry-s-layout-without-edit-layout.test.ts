import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
  },
});

const site = await testSite({
  plugins: [posts],
  config: {
    // Edits their own posts but holds no `entry:post:edit_layout`.
    roles: {
      contributor: {
        can: {
          admin: ["access"],
          user: ["edit_own"],
          entry: { post: ["read", "create", "edit_own"] },
          term: { category: ["read", "assign"], tag: ["read", "assign"] },
        },
      },
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

function group(id: string, children: readonly unknown[]) {
  return { id, name: "core/group", attrs: { content: children } };
}

function button(id: string, attrs: Record<string, unknown> = {}) {
  return {
    id,
    name: "core/button",
    attrs: { label: "Buy", href: "/buy", ...attrs },
  };
}

function v2(blocks: readonly unknown[]) {
  return { version: "plumix.v2" as const, blocks };
}

/** A draft of the role's own, holding a text, a group and a button. */
async function ownDraftAs(role: "contributor" | "author") {
  const writer = await site.factory.user.create({ role });
  const own = await site.factory.draft.create({
    authorId: writer.id,
    content: v2([text("p1"), group("g1", [text("p2")]), button("b1")]),
  });
  return { writer, own };
}

const layoutChanges: readonly [string, ReturnType<typeof v2>, string][] = [
  [
    "an inserted node",
    v2([text("p1"), group("g1", [text("p2")]), button("b1"), text("p3")]),
    "blocks[3]",
  ],
  [
    "a removed node",
    v2([text("p1"), group("g1", []), button("b1")]),
    "blocks[1].content[0]",
  ],
  [
    "a moved node",
    v2([group("g1", [text("p2"), text("p1")]), button("b1")]),
    "blocks[0].content[1]",
  ],
  [
    "a reordered sibling",
    v2([group("g1", [text("p2")]), text("p1"), button("b1")]),
    "blocks[1]",
  ],
  [
    "a changed style",
    v2([
      text("p1", { style: { large: { color: "#e11" } } }),
      group("g1", [text("p2")]),
      button("b1"),
    ]),
    "blocks[0]",
  ],
  [
    "a changed hidden flag",
    v2([
      text("p1", { hidden: { small: true } }),
      group("g1", [text("p2")]),
      button("b1"),
    ]),
    "blocks[0]",
  ],
  [
    "changed HTML attributes",
    v2([
      text("p1"),
      group("g1", [text("p2", { htmlAttrs: { id: "x" } })]),
      button("b1"),
    ]),
    "blocks[1].content[0]",
  ],
  [
    "a changed class name",
    v2([
      text("p1", { className: "lead" }),
      group("g1", [text("p2")]),
      button("b1"),
    ]),
    "blocks[0]",
  ],
  [
    "a changed tag name",
    v2([
      text("p1"),
      { ...group("g1", [text("p2")]), tagName: "aside" },
      button("b1"),
    ]),
    "blocks[1]",
  ],
  [
    "a changed settings input",
    v2([
      text("p1"),
      group("g1", [text("p2")]),
      button("b1", { openInNewTab: true }),
    ]),
    "blocks[2]",
  ],
  [
    "a renamed node",
    v2([
      { id: "p1", name: "core/code", attrs: { text: "Hello" } },
      group("g1", [text("p2")]),
      button("b1"),
    ]),
    "blocks[0]",
  ],
  [
    "a node copied under its own id",
    v2([text("p1"), text("p1"), group("g1", [text("p2")]), button("b1")]),
    "blocks[1]",
  ],
];

describe("saving an entry as a writer without edit_layout", () => {
  test.each(layoutChanges)("refuses %s", async (_, content, path) => {
    const { writer, own } = await ownDraftAs("contributor");

    const update = site.actingAs(writer).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        // A reorder moves two siblings, so the change can name more than one.
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "layout_change", path }),
        ]) as unknown,
      },
    });
  });

  test.each([
    [
      "a changed content input",
      v2([
        text("p1", { attrs: { body: "<p>Fixed</p>" } }),
        group("g1", [text("p2")]),
        button("b1", { label: "Order", href: "/order" }),
      ]),
    ],
    [
      "a changed label",
      v2([
        text("p1", { label: "Intro" }),
        group("g1", [text("p2")]),
        button("b1"),
      ]),
    ],
  ])("accepts %s", async (_, content) => {
    const { writer, own } = await ownDraftAs("contributor");

    const updated = await site.actingAs(writer).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(content);
  });
});

describe("saving an entry as a writer with edit_layout", () => {
  test.each(layoutChanges)("saves %s", async (_, content) => {
    const { writer, own } = await ownDraftAs("author");

    const updated = await site.actingAs(writer).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(content);
  });
});
