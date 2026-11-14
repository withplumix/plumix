import { describe, expect, test } from "vitest";

import type { JsonValue } from "../../src/json.js";
import { defineBlock } from "../../src/blocks/block-registry.js";
import { etagOf } from "../../src/db/concurrency.js";
import { definePlugin } from "../../src/plugin/define.js";
import { repeater, text, url } from "../../src/plugin/fields/index.js";
import { testSite } from "../../src/test/site.js";

const links = () =>
  repeater("links").fields([text("label"), url("url").required()]);

const stories = definePlugin("stories", {
  setup: (ctx) => {
    ctx.registerEntryType("story", {
      label: "Stories",
      supports: ["autosave"],
    });
    ctx.registerEntryMetaBox("box", {
      label: "Box",
      entryTypes: ["story"],
      fields: [links()],
    });
    ctx.registerBlock(
      defineBlock({
        name: "test/links",
        view: () => Promise.resolve({ default: () => null }),
        inputs: [links()],
      }),
    );
  },
});

const site = await testSite({ plugins: [stories] });

/** The required `url` is still empty. */
const halfFilled: JsonValue[] = [{ label: "Home" }];

const filledIn: JsonValue[] = [{ label: "Home", url: "/" }];

/** A scheduled entry's time is still to come. */
const tomorrow = new Date(Date.now() + 86_400_000);

type Holder = "meta" | "block";

/** The fields that put the row in a meta box or in a block's attrs. */
function holding(holder: Holder, rows: JsonValue[]) {
  return holder === "meta"
    ? { meta: { links: rows } }
    : {
        content: {
          version: "plumix.v2" as const,
          blocks: [{ id: "l1", name: "test/links", attrs: { links: rows } }],
        },
      };
}

/** Only a field refusal counts; any other failure fails the test. */
async function outcome(save: Promise<unknown>): Promise<"saved" | "refused"> {
  try {
    await save;
    return "saved";
  } catch (error) {
    const { code, data } = error as {
      code?: string;
      data?: { reason?: string };
    };
    if (code === "INVALID_BLOCK_CONTENT") return "refused";
    if (code === "CONFLICT" && data?.reason === "meta_invalid_value") {
      return "refused";
    }
    throw error;
  }
}

describe.each<Holder>(["meta", "block"])(
  "a half-filled required repeater row in %s",
  (holder) => {
    test("saves on a draft create", async () => {
      const editor = await site.factory.editor.create();

      const save = site.actingAs(editor).rpc.entry.create({
        type: "story",
        slug: `draft-create-${holder}`,
        ...holding(holder, halfFilled),
      });

      expect(await outcome(save)).toBe("saved");
    });

    test("saves on a draft update", async () => {
      const editor = await site.factory.editor.create();
      const draft = await site.factory.draft.create({
        type: "story",
        authorId: editor.id,
      });

      const save = site.actingAs(editor).rpc.entry.update({
        id: draft.id,
        ifMatch: etagOf(draft.updatedAt),
        ...holding(holder, halfFilled),
      });

      expect(await outcome(save)).toBe("saved");
    });

    test("saves on an autosave", async () => {
      const editor = await site.factory.editor.create();
      const live = await site.factory.published.create({
        type: "story",
        authorId: editor.id,
      });

      const save = site.actingAs(editor).rpc.entry.update({
        id: live.id,
        saveAs: "draft",
        ifMatch: etagOf(live.updatedAt),
        ...holding(holder, halfFilled),
      });

      expect(await outcome(save)).toBe("saved");
    });

    test("is refused on a published create", async () => {
      const editor = await site.factory.editor.create();

      const save = site.actingAs(editor).rpc.entry.create({
        type: "story",
        slug: `published-create-${holder}`,
        status: "published",
        ...holding(holder, halfFilled),
      });

      expect(await outcome(save)).toBe("refused");
    });

    test("is refused when the draft holding it is published", async () => {
      const editor = await site.factory.editor.create();
      const draft = await site.factory.draft.create({
        type: "story",
        authorId: editor.id,
      });
      const saved = await site.actingAs(editor).rpc.entry.update({
        id: draft.id,
        ifMatch: etagOf(draft.updatedAt),
        ...holding(holder, halfFilled),
      });

      const publish = site.actingAs(editor).rpc.entry.update({
        id: draft.id,
        status: "published",
        ifMatch: saved.etag,
      });

      expect(await outcome(publish)).toBe("refused");
    });

    test("is refused when the autosave holding it is published", async () => {
      const editor = await site.factory.editor.create();
      const live = await site.factory.published.create({
        type: "story",
        authorId: editor.id,
      });
      await site.actingAs(editor).rpc.entry.update({
        id: live.id,
        saveAs: "draft",
        ifMatch: etagOf(live.updatedAt),
        ...holding(holder, halfFilled),
      });

      const publish = site.actingAs(editor).rpc.entry.publish({
        id: live.id,
        ifMatch: etagOf(live.updatedAt),
      });

      expect(await outcome(publish)).toBe("refused");
    });

    test("saves when a live entry holding it is edited", async () => {
      const editor = await site.factory.editor.create();
      const live = await site.factory.published.create({
        type: "story",
        authorId: editor.id,
        ...holding(holder, halfFilled),
      });

      const save = site.actingAs(editor).rpc.entry.update({
        id: live.id,
        saveAs: "live",
        status: "published",
        title: "Renamed",
        ifMatch: etagOf(live.updatedAt),
        // Content is sent whole; an untouched meta key isn't sent at all.
        ...(holder === "block" ? holding(holder, halfFilled) : {}),
      });

      expect(await outcome(save)).toBe("saved");
    });

    test("saves when a scheduled entry holding it is edited", async () => {
      const editor = await site.factory.editor.create();
      const scheduled = await site.factory.published.create({
        type: "story",
        authorId: editor.id,
        status: "scheduled",
        publishedAt: tomorrow,
        ...holding(holder, halfFilled),
      });

      const save = site.actingAs(editor).rpc.entry.update({
        id: scheduled.id,
        status: "scheduled",
        title: "Renamed",
        ifMatch: etagOf(scheduled.updatedAt),
        // Content is sent whole; an untouched meta key isn't sent at all.
        ...(holder === "block" ? holding(holder, halfFilled) : {}),
      });

      expect(await outcome(save)).toBe("saved");
    });

    test("is refused when a scheduled entry is edited to hold it", async () => {
      const editor = await site.factory.editor.create();
      const scheduled = await site.factory.published.create({
        type: "story",
        authorId: editor.id,
        status: "scheduled",
        publishedAt: tomorrow,
      });

      const save = site.actingAs(editor).rpc.entry.update({
        id: scheduled.id,
        ifMatch: etagOf(scheduled.updatedAt),
        ...holding(holder, halfFilled),
      });

      expect(await outcome(save)).toBe("refused");
    });

    test("saves when the draft holding it is published with it filled in", async () => {
      const editor = await site.factory.editor.create();
      const draft = await site.factory.draft.create({
        type: "story",
        authorId: editor.id,
        ...holding(holder, halfFilled),
      });

      const publish = site.actingAs(editor).rpc.entry.update({
        id: draft.id,
        status: "published",
        ifMatch: etagOf(draft.updatedAt),
        ...holding(holder, filledIn),
      });

      expect(await outcome(publish)).toBe("saved");
    });

    test("saves when the autosave holding it filled in is published", async () => {
      const editor = await site.factory.editor.create();
      const live = await site.factory.published.create({
        type: "story",
        authorId: editor.id,
      });
      await site.actingAs(editor).rpc.entry.update({
        id: live.id,
        saveAs: "draft",
        ifMatch: etagOf(live.updatedAt),
        ...holding(holder, filledIn),
      });

      const publish = site.actingAs(editor).rpc.entry.publish({
        id: live.id,
        ifMatch: etagOf(live.updatedAt),
      });

      expect(await outcome(publish)).toBe("saved");
    });
  },
);
