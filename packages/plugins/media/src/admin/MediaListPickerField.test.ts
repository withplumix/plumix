import { describe, expect, test } from "vitest";

import { normalizeIds } from "./MediaListPickerField.js";

describe("normalizeIds", () => {
  test("keeps an array of plain ids (meta storage shape)", () => {
    expect(normalizeIds(["42", "43"])).toEqual(["42", "43"]);
  });

  test("heals legacy { id, ... } items to their ids, keeping order", () => {
    expect(
      normalizeIds([{ id: "42", mime: "image/png" }, "43", { id: "44" }]),
    ).toEqual(["42", "43", "44"]);
  });

  test("drops empty ids and id-less garbage", () => {
    expect(normalizeIds(["", { mime: "x" }, null, 7, "42"])).toEqual(["42"]);
  });

  test("non-array storage reads as empty", () => {
    expect(normalizeIds("42")).toEqual([]);
    expect(normalizeIds(undefined)).toEqual([]);
  });
});
