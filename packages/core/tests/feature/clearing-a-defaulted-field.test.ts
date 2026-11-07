import { describe, expect, test } from "vitest";

import type { MetaBoxField } from "../../src/plugin/manifest.js";
import { requestStore } from "../../src/context/stores.js";
import { eq } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  date,
  entry,
  group,
  json,
  link,
  number,
  repeater,
  text,
} from "../../src/plugin/fields/index.js";
import { seedFromMetaBoxes } from "../../src/plugin/manifest-types.js";
import { resolveEntryList } from "../../src/route/render/resolve-entry-list.js";
import { testSite } from "../../src/test/site.js";

/**
 * Field types whose clear becomes a deletion, with the value the form sends. A
 * default is a starting value, not a read fallback, so the key stays absent.
 */
const CASES: readonly {
  readonly type: string;
  readonly entryType: string;
  readonly field: MetaBoxField;
  readonly cleared: unknown;
}[] = [
  {
    type: "number",
    entryType: "with_number",
    field: number("v").default(3).build(),
    cleared: null,
  },
  {
    type: "date",
    entryType: "with_date",
    field: date("v").default("2026-01-01").build(),
    cleared: null,
  },
  {
    type: "link",
    entryType: "with_link",
    field: link("v").default({ url: "/pricing" }).build(),
    cleared: null,
  },
  {
    type: "json",
    entryType: "with_json",
    field: json("v").default({ a: 1 }).build(),
    cleared: null,
  },
  {
    type: "single reference",
    entryType: "with_reference",
    field: entry("v", ["post"]).returns("id").default("1").build(),
    cleared: null,
  },
  {
    type: "group",
    entryType: "with_group",
    field: group("v")
      .fields([text("title")])
      .default({ title: "Untitled" })
      .build(),
    cleared: { title: "" },
  },
  {
    type: "repeater",
    entryType: "with_repeater",
    field: repeater("v")
      .fields([text("q")])
      .default([{ q: "Why?" }])
      .build(),
    cleared: [],
  },
];

const site = await testSite({
  plugins: [
    definePlugin("defaults", {
      // Each field alone in a box on its own entry type.
      setup: (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
        for (const { entryType, field } of CASES) {
          ctx.registerEntryType(entryType, { label: entryType });
          ctx.registerEntryMetaBox(`box_${entryType}`, {
            label: "Box",
            entryTypes: [entryType],
            fields: [field],
          });
        }
      },
    }),
  ],
});

describe("clearing a defaulted field", () => {
  test.each(CASES)(
    "$type: cleared stays empty in the read, the seed and the render path",
    async ({ entryType, field, cleared }) => {
      const admin = site.actingAs("admin");
      const created = await admin.rpc.entry.create({
        type: entryType,
        slug: "defaulted",
      });
      expect(Object.hasOwn(created.meta, "v")).toBe(true);

      const updated = await admin.rpc.entry.update({
        id: created.id,
        meta: { v: cleared },
        ifMatch: created.etag,
      });

      // The read.
      const read = await admin.rpc.entry.get({ id: created.id });
      expect(read.meta).not.toHaveProperty("v");

      // The admin seed shows nothing for it.
      const seed = seedFromMetaBoxes([{ fields: [field] }], read.meta);
      expect(seed.v).toBeUndefined();

      // The render path a template and a feed read through.
      const ctx = site.context;
      const rows = await ctx.db.query.entries.findMany({
        where: eq(entries.id, created.id),
      });
      const [rendered] = await requestStore.run(ctx, () =>
        resolveEntryList(ctx, rows),
      );
      expect(rendered?.meta).not.toHaveProperty("v");
      expect(rows[0]?.meta).not.toHaveProperty("v");

      // Saving the form as seeded writes nothing back for it.
      await admin.rpc.entry.update({
        id: created.id,
        meta: seed,
        ifMatch: updated.etag,
      });
      const after = await ctx.db.query.entries.findFirst({
        where: eq(entries.id, created.id),
      });
      expect(after?.meta).not.toHaveProperty("v");
    },
  );
});
