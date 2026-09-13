import { describe, expect, test } from "vitest";

import { chunkForD1, D1_MAX_BOUND_PARAMETERS } from "./d1-chunk.js";

describe("chunkForD1", () => {
  test("returns one chunk when the input is under the limit", () => {
    expect(chunkForD1([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  test("splits into limit-sized chunks, the last one holding the remainder", () => {
    expect(chunkForD1([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("returns no chunks for an empty input", () => {
    expect(chunkForD1([], 10)).toEqual([]);
  });

  test("defaults to the D1 bound-parameter cap of 100", () => {
    const ids = Array.from({ length: 101 }, (_, i) => i);

    const chunks = chunkForD1(ids);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(D1_MAX_BOUND_PARAMETERS);
    expect(chunks[1]).toHaveLength(1);
  });
});
