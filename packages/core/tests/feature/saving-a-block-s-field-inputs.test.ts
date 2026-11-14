import { describe, expect, test } from "vitest";

import { defineBlock } from "../../src/blocks/block-registry.js";
import { etagOf } from "../../src/db/concurrency.js";
import { META_FIELD_MESSAGES } from "../../src/meta/contract/field-messages.js";
import { definePlugin } from "../../src/plugin/define.js";
import { repeater, select, text, url } from "../../src/plugin/fields/index.js";
import { testSite } from "../../src/test/site.js";

const nav = definePlugin("nav", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryType("story", {
      label: "Stories",
      supports: ["autosave"],
    });
    ctx.registerBlock(
      defineBlock({
        name: "test/links",
        view: () => Promise.resolve({ default: () => null }),
        inputs: [
          repeater("links").fields([text("label"), url("url")]),
          select("tone").options(["plain", "loud"]),
          text("title").sanitize((value) => value.trim()),
        ],
      }),
    );
  },
});

const site = await testSite({ plugins: [nav] });

function links(id: string, rows: readonly unknown[], attrs = {}) {
  return { id, name: "test/links", attrs: { links: rows, ...attrs } };
}

function v2(blocks: readonly unknown[]) {
  return { version: "plumix.v2" as const, blocks };
}

describe("saving a block whose inputs are meta-box fields", () => {
  test("refuses a row whose url isn't one, with the meta field's error", async () => {
    const author = await site.factory.author.create();

    const create = site.actingAs(author).rpc.entry.create({
      type: "post",
      title: "Links",
      slug: "links",
      content: v2([links("l1", [{ label: "Home", url: "not a url" }])]),
    });

    await expect(create).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "invalid_attribute",
            path: "blocks[0]",
            nodeName: "test/links",
            attributeName: "links",
            errors: [
              { path: "links.0.url", message: META_FIELD_MESSAGES.invalidUrl },
            ],
          }),
        ],
      },
    });
  });

  test("accepts a row whose url is one", async () => {
    const author = await site.factory.author.create();
    const content = v2([links("l1", [{ label: "Home", url: "/" }])]);

    const created = await site.actingAs(author).rpc.entry.create({
      type: "post",
      title: "Links",
      slug: "links",
      content,
    });

    expect(created.content).toEqual(content);
  });

  test("refuses a select value outside its options when it goes live", async () => {
    const author = await site.factory.author.create();

    const create = site.actingAs(author).rpc.entry.create({
      type: "post",
      slug: "tone",
      status: "published",
      content: v2([links("l1", [], { tone: "shouty" })]),
    });

    await expect(create).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "invalid_attribute",
            attributeName: "tone",
            errors: [
              { path: "tone", message: META_FIELD_MESSAGES.invalidOption },
            ],
          }),
        ],
      },
    });
  });

  test("stores the value the field's sanitize returns", async () => {
    const author = await site.factory.author.create();

    const created = await site.actingAs(author).rpc.entry.create({
      type: "post",
      slug: "trimmed",
      content: v2([links("l1", [], { title: "  Hi  " })]),
    });

    expect(created.content).toEqual(v2([links("l1", [], { title: "Hi" })]));
  });

  test("keeps a now-invalid value the entry already holds", async () => {
    const author = await site.factory.author.create();
    const stored = links("l1", [{ label: "Home", url: "not a url" }], {
      tone: "shouty",
    });
    const own = await site.factory.draft.create({
      authorId: author.id,
      content: v2([stored]),
    });
    const content = v2([stored, links("l2", [])]);

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      content,
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(content);
  });

  test("refuses a now-invalid value copied onto another node, live", async () => {
    const editor = await site.factory.editor.create();
    const stored = links("l1", [], { tone: "shouty" });
    const own = await site.factory.published.create({
      authorId: editor.id,
      content: v2([stored]),
    });

    const update = site.actingAs(editor).rpc.entry.update({
      id: own.id,
      content: v2([stored, { ...stored, id: "l2" }]),
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "invalid_attribute",
            path: "blocks[1]",
          }),
        ],
      },
    });
  });

  test("stores the sanitized value of a block nested in a slot", async () => {
    const author = await site.factory.author.create();
    const group = (child: unknown) => ({
      id: "g1",
      name: "core/group",
      attrs: { content: [child] },
    });

    const created = await site.actingAs(author).rpc.entry.create({
      type: "post",
      slug: "nested",
      content: v2([group(links("l1", [], { title: " Hi " }))]),
    });

    expect(created.content).toEqual(
      v2([group(links("l1", [], { title: "Hi" }))]),
    );
  });

  test("refuses an invalid value edited into a node the entry holds, live", async () => {
    const editor = await site.factory.editor.create();
    const own = await site.factory.published.create({
      authorId: editor.id,
      content: v2([links("l1", [], { tone: "plain" })]),
    });

    const update = site.actingAs(editor).rpc.entry.update({
      id: own.id,
      content: v2([links("l1", [], { tone: "shouty" })]),
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [expect.objectContaining({ attributeName: "tone" })],
      },
    });
  });

  test("refuses a now-invalid value its node holds twice, live", async () => {
    const editor = await site.factory.editor.create();
    const stored = links("l1", [], { tone: "shouty" });
    const own = await site.factory.published.create({
      authorId: editor.id,
      content: v2([stored]),
    });

    const update = site.actingAs(editor).rpc.entry.update({
      id: own.id,
      content: v2([stored, stored]),
      ifMatch: etagOf(own.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "invalid_attribute",
            path: "blocks[1]",
          }),
        ],
      },
    });
  });

  test("an update stores the value the field's sanitize returns", async () => {
    const author = await site.factory.author.create();
    const own = await site.factory.draft.create({
      authorId: author.id,
      content: v2([links("l1", [])]),
    });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      content: v2([links("l1", [], { title: " Hi " })]),
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(v2([links("l1", [], { title: "Hi" })]));
  });

  test("an update that sends no content keeps the stored content", async () => {
    const author = await site.factory.author.create();
    const content = v2([links("l1", [], { title: "Hi" })]);
    const own = await site.factory.draft.create({
      authorId: author.id,
      content,
    });

    const updated = await site.actingAs(author).rpc.entry.update({
      id: own.id,
      title: "Renamed",
      ifMatch: etagOf(own.updatedAt),
    });

    expect(updated.content).toEqual(content);
  });

  test("publishing an autosave names the attr its field refuses", async () => {
    const editor = await site.factory.editor.create();
    const live = await site.factory.published.create({
      type: "story",
      authorId: editor.id,
    });
    await site.actingAs(editor).rpc.entry.update({
      id: live.id,
      saveAs: "draft",
      content: v2([links("l1", [], { tone: "shouty" })]),
      ifMatch: etagOf(live.updatedAt),
    });

    const publish = site.actingAs(editor).rpc.entry.publish({
      id: live.id,
      ifMatch: etagOf(live.updatedAt),
    });

    await expect(publish).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({ path: "blocks[0]", attributeName: "tone" }),
        ],
      },
    });
  });
});
