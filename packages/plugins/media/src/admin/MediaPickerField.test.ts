import { describe, expect, test } from "vitest";

import {
  normalizeValue,
  offersClear,
  selectionWriteValue,
} from "./MediaPickerField.js";

describe("offersClear", () => {
  test("offers Clear for a filled, optional metabox field", () => {
    expect(offersClear(true, false, false)).toBe(true);
  });

  test("hides Clear in the block editor — the block is removed instead", () => {
    expect(offersClear(true, false, true)).toBe(false);
  });

  test("hides Clear when there is no value to clear", () => {
    expect(offersClear(false, false, false)).toBe(false);
  });

  test("hides Clear for a required field", () => {
    expect(offersClear(true, true, false)).toBe(false);
  });
});

describe("normalizeValue", () => {
  test("wraps a plain id string (meta storage shape)", () => {
    expect(normalizeValue("42")).toEqual({ id: "42" });
  });

  test("keeps a block-attr snapshot object with its render fields", () => {
    expect(
      normalizeValue({ id: "42", mime: "image/png", filename: "cat.png" }),
    ).toEqual({ id: "42", mime: "image/png", filename: "cat.png", alt: null });
  });

  test("rejects an empty string and id-less garbage", () => {
    expect(normalizeValue("")).toBeNull();
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue({ mime: "image/png" })).toBeNull();
  });
});

describe("selectionWriteValue", () => {
  const selection = {
    id: "42",
    url: "/m/cat.png",
    alt: null,
    mime: "image/png",
    filename: "cat.png",
    width: null,
    height: null,
  };

  test("metabox fields write the plain id — storage is ids only", () => {
    expect(selectionWriteValue(selection, false)).toBe("42");
  });

  test("block-attr fields keep the full snapshot for render", () => {
    expect(selectionWriteValue(selection, true)).toBe(selection);
  });
});
