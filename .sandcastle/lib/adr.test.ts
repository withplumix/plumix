import { describe, expect, test } from "vitest";

import { adrNumbersIn, nextFreeAdr } from "./adr.js";

describe("adrNumbersIn", () => {
  test("reads the numbers from ADR paths and from prose that claims one", () => {
    expect(
      adrNumbersIn(
        "docs/adr/0014-the-admin-offers.md\nADR 0011 is claimed; see ADR-0016 and adr 0013",
      ),
    ).toEqual([14, 11, 16, 13]);
  });

  test("ignores four-digit numbers that are not ADRs", () => {
    expect(adrNumbersIn("fixes #2632, port 5173, year 2026")).toEqual([]);
  });
});

describe("nextFreeAdr", () => {
  test("hands out the number after the highest one taken", () => {
    expect(nextFreeAdr([1, 14, 15], new Set())).toBe("0016");
  });

  test("skips numbers another lane of this run already holds", () => {
    const held = new Set([16, 17]);

    expect(nextFreeAdr([15], held)).toBe("0018");
  });

  test("starts at 0001 when nothing is taken", () => {
    expect(nextFreeAdr([], new Set())).toBe("0001");
  });
});
