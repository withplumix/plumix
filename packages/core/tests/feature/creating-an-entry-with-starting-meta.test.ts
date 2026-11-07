import { describe, expect, test } from "vitest";

import { eq } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  group,
  number,
  repeater,
  text,
} from "../../src/plugin/fields/index.js";
import { resolveEntryList } from "../../src/route/render/resolve-entry-list.js";
import { forEntryType } from "../../src/route/render/template-builders.js";
import { resolveTemplate } from "../../src/route/render/template-hierarchy.js";
import { testSite } from "../../src/test/site.js";

const defaults = definePlugin("defaults", {
  setup: (ctx) => {
    ctx.registerEntryMetaBox("box", {
      label: "Box",
      entryTypes: ["post"],
      fields: [
        text("tone").default("warm").build(),
        number("rating").default(3).build(),
        group("seo")
          .fields([text("robots").default("index")])
          .build(),
        repeater("faq")
          .fields([text("q"), text("a").default("TBD")])
          .default([{ q: "Why?" }])
          .build(),
        text("subtitle").build(),
      ],
    });
  },
});

const site = await testSite({ plugins: [defaults] });

async function storedMeta(id: number) {
  const [row] = await site.context.db
    .select({ meta: entries.meta })
    .from(entries)
    .where(eq(entries.id, id));
  return row?.meta;
}

describe("creating an entry with starting meta", () => {
  test("stores every field default in the new entry's meta", async () => {
    const created = await site
      .actingAs("admin")
      .rpc.entry.create({ slug: "defaults" });

    const starting = {
      tone: "warm",
      rating: 3,
      seo: { robots: "index" },
      faq: [{ q: "Why?", a: "TBD" }],
    };
    expect(await storedMeta(created.id)).toEqual(starting);
    expect(created.meta).toEqual(starting);
  });

  test("meta the caller sends overlays the starting meta, and null clears a default", async () => {
    const created = await site.actingAs("admin").rpc.entry.create({
      slug: "overlay",
      meta: { tone: "cool", rating: null, subtitle: "Hi" },
    });

    expect(await storedMeta(created.id)).toEqual({
      tone: "cool",
      subtitle: "Hi",
      seo: { robots: "index" },
      faq: [{ q: "Why?", a: "TBD" }],
    });
  });

  // Nothing fills a default on read: an entry that predates it stays empty.
  test("an entry whose stored meta lacks a defaulted key reads it as absent", async () => {
    const row = await site.factory.entry.create({
      meta: { subtitle: "Stored" },
    });

    const read = await site.actingAs("admin").rpc.entry.get({ id: row.id });

    expect(read.meta).toEqual({ subtitle: "Stored" });
  });

  // A `whereMeta` rule reads the stored column, which now holds the default.
  test("a whereMeta rule matches a created entry's default", async () => {
    const admin = await site.factory.admin.create();
    const created = await site
      .actingAs(admin)
      .rpc.entry.create({ slug: "rule" });
    const [row] = await site.context.db
      .select()
      .from(entries)
      .where(eq(entries.id, created.id));
    if (!row) throw new Error("the created entry is not stored");
    const [resolved] = await resolveEntryList(site.actingAs(admin).context, [
      row,
    ]);
    if (!resolved) throw new Error("resolveEntryList returned no entry");
    const warm = forEntryType("post")
      .whereMeta("tone", "warm")
      .template(() => null);

    const matched = resolveTemplate(
      [warm],
      { kind: "entry", entryType: "post", slug: row.slug, databaseId: row.id },
      { kind: "entry", entry: resolved },
    );

    expect(matched).toBe(warm);
  });
});

/** A driver resting on its default switches its dependent on. */
const layout = definePlugin("layout", {
  setup: (ctx) => {
    ctx.registerEntryMetaBox("layout-box", {
      label: "Layout",
      entryTypes: ["post"],
      fields: [
        text("layout").default("video").build(),
        text("videoUrl")
          .required()
          .visibleWhen({ key: "layout", op: "eq", value: "video" })
          .build(),
      ],
    });
  },
});

const siteWithALayout = await testSite({ plugins: [layout] });

describe("a created entry's default", () => {
  // The default is stored, so the conditions and the publish gate judge it
  // like any other value.
  test("is seen by the conditions", async () => {
    const create = siteWithALayout
      .actingAs("admin")
      .rpc.entry.create({ slug: "live", status: "published" });

    await expect(create).rejects.toMatchObject({
      code: "CONFLICT",
      data: { key: "videoUrl" },
    });
  });
});
