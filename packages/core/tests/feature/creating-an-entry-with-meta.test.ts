import { describe, expect, test } from "vitest";

import { entry } from "../../src/events-and-filters/entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import { repeater, text } from "../../src/plugin/fields/index.js";
import { testSite } from "../../src/test/site.js";

/**
 * None of these fields is required or has a default, so a draft create that
 * sends none of them stores no meta.
 */
const postMeta = definePlugin("post-meta", {
  setup: (ctx) => {
    ctx.registerEntryMetaBox("test-seo", {
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
    ctx.registerEntryMetaBox("article", {
      label: "Article",
      entryTypes: ["post"],
      fields: [
        text("subtitle").maxLength(5).build(),
        repeater("sections")
          .fields([text("heading").required(), text("body")])
          .label("Sections")
          .build(),
      ],
    });
    // The term and user wrappers share this machinery, so covering entry is
    // enough.
    ctx.registerEntryMetaBox("ownership", {
      label: "Ownership",
      entryTypes: ["post"],
      fields: [
        {
          key: "owner",
          label: "Owner",
          type: "string",
          inputType: "user",
          referenceTarget: { kind: "user" },
        },
      ],
    });
    ctx.registerEntryMetaBox("test-gated", {
      label: "Gated",
      entryTypes: ["post"],
      fields: [
        {
          key: "private_note",
          label: "Private note",
          type: "string",
          inputType: "text",
          capability: "entry:post:view_private_notes",
        },
      ],
    });
  },
});

const site = await testSite({ plugins: [postMeta] });

describe("creating an entry with meta", () => {
  test("registered keys are stored and come back on the response", async () => {
    const created = await site.actingAs("admin").rpc.entry.create({
      title: "with-meta",
      slug: "with-meta",
      meta: { meta_title: "SEO title", is_featured: true },
    });

    expect(created.meta).toEqual({
      meta_title: "SEO title",
      is_featured: true,
    });
  });

  test("answers with an etag the next save can use", async () => {
    const admin = site.actingAs("admin");
    const created = await admin.rpc.entry.create({
      title: "with-meta",
      slug: "with-meta-etag",
      meta: { meta_title: "SEO title" },
    });

    const saved = await admin.rpc.entry.update({
      id: created.id,
      title: "renamed",
      ifMatch: created.etag,
    });

    expect(saved.title).toBe("renamed");
  });

  test("announces entry.metaChanged once, with the keys it set", async () => {
    await site.actingAs("admin").rpc.entry.create({
      title: "announced",
      slug: "announced-meta",
      meta: { meta_title: "SEO title" },
    });

    expect(site.events.emitted(entry.metaChanged)).toEqual([
      expect.objectContaining({
        changes: { set: { meta_title: "SEO title" }, removed: [] },
      }),
    ]);
  });

  test("an unregistered key is refused as a conflict naming the key", async () => {
    const create = site.actingAs("admin").rpc.entry.create({
      title: "bad-meta",
      slug: "bad-meta",
      meta: { mystery: "x" },
    });

    await expect(create).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered", key: "mystery" },
    });
  });

  test("constraint violations come back as { path, message } errors on the conflict", async () => {
    // Creating straight to `published` runs the strict gate; a draft create
    // is lenient (its own test below), so publish is what enforces here.
    const create = site.actingAs("admin").rpc.entry.create({
      title: "bad-constraints",
      slug: "bad-constraints",
      status: "published",
      meta: {
        subtitle: "way too long",
        sections: [{ heading: "", body: "kept" }],
      },
    });

    await expect(create).rejects.toMatchObject({
      code: "CONFLICT",
      data: {
        reason: "meta_invalid_value",
        key: "subtitle",
        errors: [
          {
            path: "subtitle",
            message: { id: "metaField.maxLength", values: { max: 5 } },
          },
          {
            path: "sections.0.heading",
            message: { id: "metaField.required" },
          },
        ],
      },
    });
  });

  test("a draft create keeps a value that breaks a constraint", async () => {
    // A brand-new draft is work in progress: an over-length value is kept
    // rather than refused, so authoring never hits a wall. Publish enforces.
    const created = await site.actingAs("admin").rpc.entry.create({
      title: "wip",
      slug: "wip",
      meta: { subtitle: "way too long" },
    });

    expect(created.status).toBe("draft");
    expect(created.meta.subtitle).toBe("way too long");
  });

  test("a user reference field refuses a user that does not exist", async () => {
    const create = site.actingAs("admin").rpc.entry.create({
      title: "missing-ref",
      slug: "missing-ref",
      meta: { owner: "999999" },
    });

    await expect(create).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "owner" },
    });
  });

  test("a meta map over 200 keys is refused by the input schema", async () => {
    const oversized = Object.fromEntries(
      Array.from({ length: 201 }, (_, i) => [`k${String(i)}`, "x"]),
    );

    const create = site.actingAs("admin").rpc.entry.create({
      title: "too-much",
      slug: "too-much",
      meta: oversized,
    });

    // The cap is a wire validation check, not a sanitizer rejection, so it
    // answers BAD_REQUEST rather than a CONFLICT reason.
    await expect(create).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("a field gated behind a capability the caller lacks is forbidden", async () => {
    const create = site.actingAs("author").rpc.entry.create({
      title: "gated",
      slug: "gated",
      meta: { private_note: "leaked" },
    });

    await expect(create).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:view_private_notes" },
    });
  });
});

const requiredSubtitle = definePlugin("required-subtitle", {
  setup: (ctx) => {
    ctx.registerEntryMetaBox("box", {
      label: "Article",
      entryTypes: ["post"],
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
  },
});

const siteRequiringASubtitle = await testSite({ plugins: [requiredSubtitle] });

describe("creating an entry straight to published", () => {
  // The same crossing as publishing, so a required field the create never
  // sent counts as missing.
  test("enforces a required field it omits", async () => {
    const create = siteRequiringASubtitle.actingAs("admin").rpc.entry.create({
      title: "live",
      slug: "live",
      status: "published",
      meta: {},
    });

    await expect(create).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "subtitle" },
    });
  });
});
