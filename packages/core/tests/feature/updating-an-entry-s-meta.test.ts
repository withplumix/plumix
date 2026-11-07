import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { entry } from "../../src/events-and-filters/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { entryRpc } from "../../src/rpc/filters.js";
import { testSite } from "../../src/test/site.js";

const layout = {
  key: "layout",
  label: "Layout",
  type: "string",
  inputType: "text",
} as const;

/** Required only while `layout` is "video". */
const videoUrl = {
  key: "video_url",
  label: "Video",
  type: "string",
  inputType: "text",
  required: true,
  visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
} as const;

/**
 * Each type carries one meta box shape, so a test picks the shape by the
 * entry's type.
 */
const boxes = definePlugin("boxes", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryMetaBox("seo", {
      label: "SEO",
      entryTypes: ["post"],
      fields: [
        {
          key: "meta_title",
          label: "Meta title",
          type: "string",
          inputType: "text",
        },
        {
          key: "is_featured",
          label: "Featured",
          type: "boolean",
          inputType: "checkbox",
        },
      ],
    });

    ctx.registerEntryType("article", { label: "Articles" });
    ctx.registerEntryMetaBox("article", {
      label: "Article",
      entryTypes: ["article"],
      fields: [
        {
          key: "subtitle",
          label: "Subtitle",
          type: "string",
          inputType: "text",
          required: true,
        },
      ],
    });

    // The smallest shape in which one key's value decides whether another
    // key is required.
    ctx.registerEntryType("clip", { label: "Clips" });
    ctx.registerEntryMetaBox("clip-layout", {
      label: "Layout",
      entryTypes: ["clip"],
      fields: [layout, videoUrl],
    });

    // The driver defaults to the value that shows its dependent.
    ctx.registerEntryType("reel", { label: "Reels" });
    ctx.registerEntryMetaBox("reel-layout", {
      label: "Layout",
      entryTypes: ["reel"],
      fields: [{ ...layout, default: "video" }, videoUrl],
    });

    // The driver defaults to the value that hides its dependent.
    ctx.registerEntryType("feature", { label: "Features" });
    ctx.registerEntryMetaBox("feature-layout", {
      label: "Layout",
      entryTypes: ["feature"],
      fields: [{ ...layout, default: "standard" }, videoUrl],
    });

    // The dependent has a default of its own.
    ctx.registerEntryType("teaser", { label: "Teasers" });
    ctx.registerEntryMetaBox("teaser-layout", {
      label: "Layout",
      entryTypes: ["teaser"],
      fields: [layout, { ...videoUrl, default: "https://example.com/default" }],
    });

    // The driver's `.sanitize()` yields nothing, so it is never written.
    ctx.registerEntryType("embed", { label: "Embeds" });
    ctx.registerEntryMetaBox("embed-layout", {
      label: "Layout",
      entryTypes: ["embed"],
      fields: [{ ...layout, sanitize: () => undefined as never }, videoUrl],
    });

    // The dependent takes a capability no default role holds.
    ctx.registerEntryType("trailer", { label: "Trailers" });
    ctx.registerEntryMetaBox("trailer-layout", {
      label: "Layout",
      entryTypes: ["trailer"],
      fields: [layout, { ...videoUrl, capability: "video:manage" }],
    });

    ctx.registerEntryType("tally", { label: "Tallies" });
    ctx.registerEntryMetaBox("count", {
      label: "Count",
      entryTypes: ["tally"],
      fields: [
        { key: "count", label: "Count", type: "number", inputType: "number" },
        {
          key: "reason",
          label: "Reason",
          type: "string",
          inputType: "text",
          required: true,
          visibleWhen: [[{ key: "count", op: "eq", value: 10 }]],
        },
      ],
    });

    // `advanced` shows `layout`, which shows the required `video_url`.
    ctx.registerEntryType("chain", { label: "Chains" });
    ctx.registerEntryMetaBox("chain", {
      label: "Chain",
      entryTypes: ["chain"],
      fields: [
        {
          key: "advanced",
          label: "Advanced",
          type: "boolean",
          inputType: "toggle",
        },
        {
          ...layout,
          visibleWhen: [[{ key: "advanced", op: "eq", value: true }]],
        },
        videoUrl,
      ],
    });

    // `advanced` shows `mode`, which shows `note`.
    ctx.registerEntryType("memo", { label: "Memos" });
    ctx.registerEntryMetaBox("memo", {
      label: "Memo",
      entryTypes: ["memo"],
      fields: [
        {
          key: "advanced",
          label: "Advanced",
          type: "boolean",
          inputType: "toggle",
        },
        {
          key: "mode",
          label: "Mode",
          type: "string",
          inputType: "text",
          visibleWhen: [[{ key: "advanced", op: "eq", value: true }]],
        },
        {
          key: "note",
          label: "Note",
          type: "string",
          inputType: "text",
          visibleWhen: [[{ key: "mode", op: "eq", value: "on" }]],
        },
      ],
    });

    // Each shows only while the other is empty.
    ctx.registerEntryType("contact", { label: "Contacts" });
    ctx.registerEntryMetaBox("either", {
      label: "Either",
      entryTypes: ["contact"],
      fields: [
        {
          key: "email",
          label: "Email",
          type: "string",
          inputType: "text",
          visibleWhen: [[{ key: "phone", op: "empty" }]],
        },
        {
          key: "phone",
          label: "Phone",
          type: "string",
          inputType: "text",
          visibleWhen: [[{ key: "email", op: "empty" }]],
        },
      ],
    });

    // Derived meta at the input stage: `title` is mirrored into `title_lc`
    // on every update, before sanitization.
    ctx.registerEntryType("headline", { label: "Headlines" });
    ctx.registerEntryMetaBox("derived", {
      label: "Derived",
      entryTypes: ["headline"],
      fields: [
        { key: "title", label: "Title", type: "string", inputType: "text" },
        {
          key: "title_lc",
          label: "Title (lowercase)",
          type: "string",
          inputType: "text",
        },
      ],
    });
    ctx.filters.add(entryRpc.update.input, (input) => {
      const title = input.meta?.title;
      if (typeof title !== "string") return input;
      return {
        ...input,
        meta: { ...input.meta, title_lc: title.toLowerCase() },
      };
    });

    // Decorate-on-read: `entry.get` answers with a key storage never holds.
    ctx.registerEntryType("label", { label: "Labels" });
    ctx.registerEntryMetaBox("label-title", {
      label: "Title",
      entryTypes: ["label"],
      fields: [
        { key: "title", label: "Title", type: "string", inputType: "text" },
      ],
    });
    ctx.filters.add(entryRpc.get.output, (output) => {
      if (output.type !== "label") return output;
      return { ...output, meta: { ...output.meta, _derived: "always-there" } };
    });
  },
});

const site = await testSite({ plugins: [boxes] });

describe("updating an entry's meta", () => {
  test("leaves keys outside the patch untouched", async () => {
    const admin = site.actingAs("admin");
    const post = await admin.rpc.entry.create({
      type: "post",
      title: "p",
      slug: "p",
      meta: { meta_title: "seed title", is_featured: false },
    });

    const updated = await admin.rpc.entry.update({
      id: post.id,
      meta: { is_featured: true },
      ifMatch: post.etag,
    });

    expect(updated.meta).toEqual({
      meta_title: "seed title",
      is_featured: true,
    });
  });

  test("clears a key sent as null without touching the others", async () => {
    const admin = site.actingAs("admin");
    const post = await admin.rpc.entry.create({
      type: "post",
      title: "p",
      slug: "p",
      meta: { meta_title: "keep", is_featured: true },
    });

    const updated = await admin.rpc.entry.update({
      id: post.id,
      meta: { is_featured: null },
      ifMatch: post.etag,
    });

    expect(updated.meta).toEqual({ meta_title: "keep" });
  });

  test("refuses an unregistered key before writing anything", async () => {
    const admin = site.actingAs("admin");
    const post = await admin.rpc.entry.create({
      type: "post",
      title: "p3",
      slug: "p3",
    });

    const update = admin.rpc.entry.update({
      id: post.id,
      title: "new-title",
      meta: { bogus: "x" },
      ifMatch: post.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered", key: "bogus" },
    });
    const reloaded = await admin.rpc.entry.get({ id: post.id });
    expect(reloaded.title).toBe("p3");
  });

  test("stores the meta an entry.rpc.update.input handler derives, and entry.metaChanged carries the final bag", async () => {
    const admin = site.actingAs("admin");
    const post = await admin.rpc.entry.create({
      type: "headline",
      title: "p",
      slug: "p",
    });

    await admin.rpc.entry.update({
      id: post.id,
      meta: { title: "SHOUTING" },
      ifMatch: post.etag,
    });

    const reloaded = await admin.rpc.entry.get({ id: post.id });
    expect(reloaded.meta).toEqual({
      title: "SHOUTING",
      title_lc: "shouting",
    });
    expect(site.events.emitted(entry.metaChanged)).toMatchObject([
      {
        changes: {
          set: { title: "SHOUTING", title_lc: "shouting" },
          removed: [],
        },
      },
    ]);
  });

  test("an entry.rpc.get.output handler decorates what entry.get answers without touching storage", async () => {
    const admin = site.actingAs("admin");
    const post = await admin.rpc.entry.create({
      type: "label",
      title: "p",
      slug: "p",
      meta: { title: "stored" },
    });

    const refetched = await admin.rpc.entry.get({ id: post.id });

    // No create output handler, so create answered with the bag unadorned.
    expect(post.meta).toEqual({ title: "stored" });
    expect(refetched.meta).toEqual({
      title: "stored",
      _derived: "always-there",
    });
  });
});

describe("a required meta field", () => {
  test("left empty by a draft edit is kept, since a draft is lenient", async () => {
    const admin = await site.factory.admin.create();
    const draft = await site.factory.draft.create({
      authorId: admin.id,
      type: "article",
    });

    const updated = await site.actingAs(admin).rpc.entry.update({
      id: draft.id,
      meta: { subtitle: "" },
      ifMatch: etagOf(draft.updatedAt),
    });

    expect(updated.meta.subtitle).toBe("");
  });

  test("left empty by a draft blocks publishing it, though the publish carries no meta", async () => {
    const admin = await site.factory.admin.create();
    const draft = await site.factory.draft.create({
      authorId: admin.id,
      type: "article",
    });
    const edited = await site.actingAs(admin).rpc.entry.update({
      id: draft.id,
      meta: { subtitle: "" },
      ifMatch: etagOf(draft.updatedAt),
    });

    // The publish transition strict-validates the full stored bag.
    const publish = site.actingAs(admin).rpc.entry.update({
      id: draft.id,
      status: "published",
      ifMatch: edited.etag,
    });

    await expect(publish).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value" },
    });
  });
});

// Strict edits validate only their own keys so older drift can't block them,
// but switching a driver on makes its dependent required: that drift is this
// edit's.
describe("a field a driver shows", () => {
  test("switched visible without a value by a live edit is refused", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "clip",
      status: "published",
      meta: { layout: "standard" },
    });

    const update = site.actingAs(admin).rpc.entry.update({
      id: post.id,
      meta: { layout: "video" },
      ifMatch: etagOf(post.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  test("switched visible without a value on a scheduled entry is refused before the cron can publish it", async () => {
    site.freezeTime("2026-10-18T12:00:00Z");
    const admin = await site.factory.admin.create();
    const scheduled = await site.factory.entry.create({
      authorId: admin.id,
      type: "clip",
      status: "scheduled",
      publishedAt: new Date("2026-10-18T13:00:00Z"),
      meta: { layout: "standard" },
    });

    const update = site.actingAs(admin).rpc.entry.update({
      id: scheduled.id,
      meta: { layout: "video" },
      ifMatch: etagOf(scheduled.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  test("switched visible is accepted when the edit supplies it", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "clip",
      status: "published",
      meta: { layout: "standard" },
    });

    const updated = await site.actingAs(admin).rpc.entry.update({
      id: post.id,
      meta: { layout: "video", video_url: "https://example.com/v" },
      ifMatch: etagOf(post.updatedAt),
    });

    expect(updated.meta.video_url).toBe("https://example.com/v");
  });

  // Visibility is judged against the row as it will be, so a hidden field is
  // dropped from the write rather than validated, as the publish gate does.
  test("hidden by the stored driver accepts an edit and is left alone", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "clip",
      status: "published",
      meta: { layout: "standard", video_url: "https://example.com/old" },
    });

    const updated = await site.actingAs(admin).rpc.entry.update({
      id: post.id,
      meta: { video_url: "" },
      ifMatch: etagOf(post.updatedAt),
    });

    expect(updated.meta.video_url).toBe("https://example.com/old");
  });

  test("shown by the stored driver still refuses being cleared", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "clip",
      status: "published",
      meta: { layout: "video", video_url: "https://example.com/v" },
    });

    const update = site.actingAs(admin).rpc.entry.update({
      id: post.id,
      meta: { video_url: "" },
      ifMatch: etagOf(post.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  // Drift the edit neither caused nor re-conditioned must not block it, even
  // when the edit re-sends a driver at its current value.
  test("does not block an edit that leaves its driver unchanged, despite older drift", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "clip",
      status: "published",
      // Already invalid: written before `video_url` was required.
      meta: { layout: "video" },
    });

    const updated = await site.actingAs(admin).rpc.entry.update({
      id: post.id,
      title: "fixed a typo",
      meta: { layout: "video" },
      ifMatch: etagOf(post.updatedAt),
    });

    expect(updated.title).toBe("fixed a typo");
  });

  test("switched visible by a draft edit stays lenient", async () => {
    const admin = await site.factory.admin.create();
    const draft = await site.factory.draft.create({
      authorId: admin.id,
      type: "clip",
      meta: { layout: "standard" },
    });

    const updated = await site.actingAs(admin).rpc.entry.update({
      id: draft.id,
      meta: { layout: "video" },
      ifMatch: etagOf(draft.updatedAt),
    });

    expect(updated.meta.layout).toBe("video");
  });

  // Defaults are written at creation, not filled on read, so a row predating
  // the default lacks the driver, and conditions judge what is stored.
  test("is not shown by a default standing in for a driver storage lacks", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "reel",
      status: "published",
      meta: {},
    });

    const updated = await site.actingAs(admin).rpc.entry.update({
      id: post.id,
      meta: { video_url: "https://example.com/v" },
      ifMatch: etagOf(post.updatedAt),
    });

    expect(updated.meta).toEqual({});
  });

  // A driver never stored reads as absent, default or not, so sending it at
  // its default switches its dependent visible like any other value.
  test("is switched visible by sending a driver storage lacks at its default", async () => {
    const admin = await site.factory.admin.create();
    // Already invalid: written before `video_url` was required.
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "reel",
      status: "published",
      meta: {},
    });

    const update = site.actingAs(admin).rpc.entry.update({
      id: post.id,
      title: "fixed a typo",
      meta: { layout: "video" },
      ifMatch: etagOf(post.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  // The publish gate judges storage, and a default on an existing row isn't
  // storage, so a required field resting on its default is still missing.
  test("switched visible by an edit is not satisfied by its own default", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "teaser",
      status: "published",
      meta: { layout: "standard" },
    });

    const update = site.actingAs(admin).rpc.entry.update({
      id: post.id,
      meta: { layout: "video" },
      ifMatch: etagOf(post.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  // The publish gate sees a field the way the editor does, and both read
  // storage alone: `layout` is absent, so `video_url` is hidden and not
  // demanded.
  test("is not demanded by publishing while a driver storage lacks hides it", async () => {
    const admin = await site.factory.admin.create();
    const draft = await site.factory.draft.create({
      authorId: admin.id,
      type: "feature",
      meta: {},
    });

    const published = await site.actingAs(admin).rpc.entry.update({
      id: draft.id,
      status: "published",
      ifMatch: etagOf(draft.updatedAt),
    });

    expect(published.status).toBe("published");
  });

  // Conditions see what storage will hold, not what the caller typed: a number
  // input posts "10", the row stores 10, and the publish gate reads 10.
  test("is judged by its driver as the pipeline settles it", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "tally",
      status: "published",
      meta: { count: 1 },
    });

    const update = site.actingAs(admin).rpc.entry.update({
      id: post.id,
      meta: { count: "10" },
      ifMatch: etagOf(post.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "reason" },
    });
  });

  // A write to a hidden driver is dropped, so it switches nothing on: its
  // dependents are judged by what the edit stores, not by what it sent.
  test("is not demanded by a hidden driver's dropped write", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "chain",
      status: "published",
      meta: { advanced: false, layout: "standard" },
    });

    const updated = await site.actingAs(admin).rpc.entry.update({
      id: post.id,
      meta: { layout: "video" },
      ifMatch: etagOf(post.updatedAt),
    });

    expect(updated.meta.layout).toBe("standard");
  });

  // The same rule inside the patch: a dropped write cannot hide another key in
  // it either, or a visible field's write would vanish without an error.
  test("is not hidden by a hidden driver's dropped write in the same edit", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "memo",
      status: "published",
      meta: { advanced: false, mode: "on" },
    });

    const updated = await site.actingAs(admin).rpc.entry.update({
      id: post.id,
      meta: { mode: "off", note: "hi" },
      ifMatch: etagOf(post.updatedAt),
    });

    expect(updated.meta.mode).toBe("on");
    expect(updated.meta.note).toBe("hi");
  });

  // Conditions can form a cycle where no set of dropped writes agrees with the
  // result, so nothing is dropped; every write is validated and stored.
  test("in an either/or pair written together is stored, not dropped", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "contact",
      status: "published",
      meta: {},
    });

    const updated = await site.actingAs(admin).rpc.entry.update({
      id: post.id,
      meta: { email: "a@example.com", phone: "555" },
      ifMatch: etagOf(post.updatedAt),
    });

    expect(updated.meta.email).toBe("a@example.com");
    expect(updated.meta.phone).toBe("555");
  });

  // A driver whose `.sanitize()` yields nothing is not written, so its stored
  // value is what decides the fields it drives, including one this edit
  // clears.
  test("is judged by the stored value of a driver the pipeline leaves unwritten", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "embed",
      status: "published",
      meta: { layout: "video", video_url: "https://example.com/v" },
    });

    const update = site.actingAs(admin).rpc.entry.update({
      id: post.id,
      meta: { layout: "standard", video_url: "" },
      ifMatch: etagOf(post.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "video_url" },
    });
  });

  // A caller cannot fix a field they are not allowed to write, so switching
  // one visible must not hand them an error about it.
  test("does not hold an edit to a field its author cannot write", async () => {
    const editor = await site.factory.editor.create();
    const post = await site.factory.entry.create({
      authorId: editor.id,
      type: "trailer",
      status: "published",
      meta: { layout: "standard" },
    });

    const updated = await site.actingAs(editor).rpc.entry.update({
      id: post.id,
      meta: { layout: "video" },
      ifMatch: etagOf(post.updatedAt),
    });

    expect(updated.meta.layout).toBe("video");
  });
});
