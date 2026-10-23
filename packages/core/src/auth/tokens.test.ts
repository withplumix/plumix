import { describe, expect, test } from "vitest";

import { hashToken, safeEqual } from "./tokens.js";

describe("safeEqual", () => {
  test("holds for identical strings", () => {
    expect(safeEqual("pl_pat_abc", "pl_pat_abc")).toBe(true);
  });

  test("holds for two empty strings", () => {
    expect(safeEqual("", "")).toBe(true);
  });

  test.each([
    ["first character", "xbc", "abc"],
    ["last character", "abx", "abc"],
    ["length, as a prefix", "ab", "abc"],
    ["length, against an empty string", "", "a"],
  ])("fails on a different %s", (_, a, b) => {
    expect(safeEqual(a, b)).toBe(false);
    expect(safeEqual(b, a)).toBe(false);
  });

  test("compares UTF-8 bytes, not UTF-16 code units", () => {
    expect(safeEqual("é", "é")).toBe(true);
    expect(safeEqual("é", "é")).toBe(false);
  });
});

describe("hashToken", () => {
  test("is the lowercase hex SHA-256 of the token", async () => {
    // SHA-256("abc"), FIPS 180-2 appendix B.1.
    expect(await hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
