import { describe, expect, test } from "vitest";

import { offersClear } from "./MediaPickerField.js";

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
