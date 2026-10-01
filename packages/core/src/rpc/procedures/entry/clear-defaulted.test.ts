import { describe, expect, test } from "vitest";

import type { MetaBoxField } from "../../../plugin/manifest.js";
import { requestStore } from "../../../context/stores.js";
import {
  date,
  entry,
  group,
  json,
  link,
  number,
  repeater,
  text,
} from "../../../plugin/fields/index.js";
import { seedFromMetaBoxes } from "../../../plugin/manifest-types.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { resolveEntryList } from "../../../route/render/resolve-entry-list.js";
import { createRpcHarness } from "../../../test/rpc.js";

// Each field type whose clear the pipeline turns into a deletion, with the
// value the admin form sends when the author clears it. A default is the
// entry's starting value, not a read fallback (ADR 0026), so once cleared the
// key stays absent on every surface — and the form, seeded from storage,
// writes nothing back for it.
const CASES: readonly {
  readonly type: string;
  readonly field: MetaBoxField;
  readonly cleared: unknown;
}[] = [
  { type: "number", field: number("v").default(3).build(), cleared: null },
  {
    type: "date",
    field: date("v").default("2026-01-01").build(),
    cleared: null,
  },
  {
    type: "link",
    field: link("v").default({ url: "/pricing" }).build(),
    cleared: null,
  },
  { type: "json", field: json("v").default({ a: 1 }).build(), cleared: null },
  {
    type: "single reference",
    field: entry("v", ["post"]).returns("id").default("1").build(),
    cleared: null,
  },
  {
    type: "group",
    field: group("v")
      .fields([text("title")])
      .default({ title: "Untitled" })
      .build(),
    cleared: { title: "" },
  },
  {
    type: "repeater",
    field: repeater("v")
      .fields([text("q")])
      .default([{ q: "Why?" }])
      .build(),
    cleared: [],
  },
];

describe("clearing a defaulted field", () => {
  test.each(CASES)(
    "$type: cleared stays empty in the read, the seed and the render path",
    async ({ field, cleared }) => {
      const plugins = createPluginRegistry();
      const box = {
        id: "box",
        label: "Box",
        entryTypes: ["post"],
        fields: [field],
        registeredBy: "test",
      };
      plugins.entryMetaBoxes.set("box", box);
      const h = await createRpcHarness({ authAs: "admin", plugins });

      const created = await h.client.entry.create({ slug: "defaulted" });
      expect(Object.hasOwn(created.meta, "v")).toBe(true);

      await h.client.entry.update({ id: created.id, meta: { v: cleared } });

      // The read.
      const read = await h.client.entry.get({ id: created.id });
      expect(read.meta).not.toHaveProperty("v");

      // The admin seed shows nothing for it.
      const seed = seedFromMetaBoxes([box], read.meta);
      expect(seed.v).toBeUndefined();

      // The render path a template and a feed read through.
      const row = await h.db.query.entries.findFirst({
        where: (t, { eq }) => eq(t.id, created.id),
      });
      if (!row) throw new Error("expected the entry row");
      const [rendered] = await requestStore.run(h.context, () =>
        resolveEntryList(h.context, [row]),
      );
      expect(rendered?.meta).not.toHaveProperty("v");
      expect(row.meta).not.toHaveProperty("v");

      // Saving the form as seeded writes nothing back for it.
      await h.client.entry.update({ id: created.id, meta: seed });
      const after = await h.db.query.entries.findFirst({
        where: (t, { eq }) => eq(t.id, created.id),
      });
      expect(after?.meta).not.toHaveProperty("v");
    },
  );
});
