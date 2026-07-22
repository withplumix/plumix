import { describe, expect, test } from "vitest";

import type { MetaBoxField } from "../../plugin/manifest.js";
import { decodeMetaBag, MetaSanitizationError } from "./core.js";

describe("MetaSanitizationError", () => {
  test("error.name is the class name, not 'Error'", () => {
    const err = MetaSanitizationError.notRegistered({ key: "tag" });
    expect(err).toBeInstanceOf(MetaSanitizationError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MetaSanitizationError");
  });
});

// Reference storage is plain ids, but bags written before the
// write-time snapshot machinery was removed may still hold
// `{ id, ... }` objects. Reads yield the id transparently; the
// entity's next save persists the plain form.
describe("decodeMetaBag (legacy reference self-heal)", () => {
  const heroField = {
    key: "hero",
    label: "Hero",
    type: "json",
    inputType: "media",
    referenceTarget: { kind: "media" },
  } as MetaBoxField;
  const galleryField = {
    key: "gallery",
    label: "Gallery",
    type: "json",
    inputType: "mediaList",
    referenceTarget: { kind: "media", multiple: true },
  } as MetaBoxField;
  const rowsField = {
    key: "rows",
    label: "Rows",
    type: "json",
    inputType: "repeater",
    subFields: [heroField],
  } as MetaBoxField;
  const fields = new Map<string, MetaBoxField>([
    ["hero", heroField],
    ["gallery", galleryField],
    ["rows", rowsField],
  ]);
  const findField = (key: string): MetaBoxField | undefined => fields.get(key);

  test("yields the id for a legacy single { id, ... } value", () => {
    const decoded = decodeMetaBag(findField, {
      hero: { id: "42", mime: "image/png", filename: "cat.png" },
    });
    expect(decoded.hero).toBe("42");
  });

  test("passes a plain id through untouched", () => {
    const decoded = decodeMetaBag(findField, { hero: "42" });
    expect(decoded.hero).toBe("42");
  });

  test("yields ids for legacy items in a multi array, keeping order", () => {
    const decoded = decodeMetaBag(findField, {
      gallery: [{ id: "42", mime: "image/png" }, "43", { id: "44" }],
    });
    expect(decoded.gallery).toEqual(["42", "43", "44"]);
  });

  test("heals legacy objects inside repeater rows without touching siblings", () => {
    const decoded = decodeMetaBag(findField, {
      rows: [
        { hero: { id: "7", mime: "image/png" }, caption: "a" },
        { hero: "8", caption: "b" },
      ],
    });
    expect(decoded.rows).toEqual([
      { hero: "7", caption: "a" },
      { hero: "8", caption: "b" },
    ]);
  });

  test("leaves garbage values without an id untouched", () => {
    const decoded = decodeMetaBag(findField, {
      hero: { mime: "image/png" },
    });
    expect(decoded.hero).toEqual({ mime: "image/png" });
  });
});
