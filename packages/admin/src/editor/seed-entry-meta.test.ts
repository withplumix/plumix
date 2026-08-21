import { describe, expect, test } from "vitest";

import type { EntryMetaBoxManifestEntry } from "@plumix/core/manifest";

import { seedEntryMetaForm } from "./seed-entry-meta.js";

const box = (
  fields: readonly { key: string; default?: unknown }[],
): EntryMetaBoxManifestEntry => ({
  id: "b",
  label: "B",
  entryTypes: ["post"],
  fields: fields.map((f) => ({
    key: f.key,
    label: f.key,
    type: "string",
    inputType: "text",
    ...(f.default !== undefined ? { default: f.default } : {}),
  })),
});

describe("seedEntryMetaForm", () => {
  test("fills a field's default when the key is absent from stored meta", () => {
    const seeded = seedEntryMetaForm(
      [box([{ key: "accent", default: "#3366ff" }])],
      {},
    );
    expect(seeded.accent).toBe("#3366ff");
  });

  test("keeps the stored value over the field default", () => {
    const seeded = seedEntryMetaForm(
      [box([{ key: "accent", default: "#3366ff" }])],
      { accent: "#ff0000" },
    );
    expect(seeded.accent).toBe("#ff0000");
  });

  test("preserves a foreign key the fields don't own (e.g. featuredImage)", () => {
    const seeded = seedEntryMetaForm(
      [box([{ key: "accent", default: "#3366ff" }])],
      {
        featuredImage: { src: "/hero.jpg" },
      },
    );
    expect(seeded.featuredImage).toEqual({ src: "/hero.jpg" });
    expect(seeded.accent).toBe("#3366ff");
  });

  test("is idempotent — seeding an already-seeded bag changes nothing", () => {
    const boxes = [
      box([{ key: "accent", default: "#3366ff" }, { key: "size" }]),
    ];
    const once = seedEntryMetaForm(boxes, { featuredImage: { src: "/h.jpg" } });
    const twice = seedEntryMetaForm(boxes, once);
    expect(twice).toEqual(once);
  });

  test("leaves a field with no default absent rather than inventing undefined keys", () => {
    const seeded = seedEntryMetaForm([box([{ key: "size" }])], {});
    expect("size" in seeded).toBe(false);
  });
});
