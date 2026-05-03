import { describe, expect, test } from "vitest";

import { parseMetaDate } from "./parse-date.js";

describe("parseMetaDate", () => {
  test("parses YYYY-MM-DD", () => {
    const result = parseMetaDate("2026-05-03");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getUTCFullYear()).toBe(2026);
    expect(result?.getUTCMonth()).toBe(4);
    expect(result?.getUTCDate()).toBe(3);
  });

  test("parses ISO datetime without offset (naive local)", () => {
    const result = parseMetaDate("2026-05-03T14:30");
    expect(result).toBeInstanceOf(Date);
  });

  test("parses ISO datetime with offset", () => {
    const result = parseMetaDate("2026-05-03T14:30:00+09:00");
    expect(result).toBeInstanceOf(Date);
    // 14:30 +09:00 → 05:30 UTC
    expect(result?.getUTCHours()).toBe(5);
    expect(result?.getUTCMinutes()).toBe(30);
  });

  test("parses ISO datetime with Z suffix", () => {
    const result = parseMetaDate("2026-05-03T14:30:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getUTCHours()).toBe(14);
  });

  test("parses ISO datetime with sub-second precision", () => {
    const result = parseMetaDate("2026-05-03T14:30:00.500Z");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getUTCMilliseconds()).toBe(500);
  });

  test("returns null for null / undefined", () => {
    expect(parseMetaDate(null)).toBeNull();
    expect(parseMetaDate(undefined)).toBeNull();
  });

  test("returns null for non-string types", () => {
    expect(parseMetaDate(0)).toBeNull();
    expect(parseMetaDate(123456)).toBeNull();
    expect(parseMetaDate(true)).toBeNull();
    expect(parseMetaDate({})).toBeNull();
    expect(parseMetaDate([])).toBeNull();
  });

  test("returns null for empty / whitespace strings", () => {
    expect(parseMetaDate("")).toBeNull();
    expect(parseMetaDate("   ")).toBeNull();
  });

  test("returns null for non-ISO strings", () => {
    expect(parseMetaDate("yesterday")).toBeNull();
    expect(parseMetaDate("05/03/2026")).toBeNull();
    expect(parseMetaDate("3 May 2026")).toBeNull();
  });

  test("returns null for time-only values (no calendar anchor)", () => {
    // `time` field stores `HH:MM`; parseMetaDate is for `date` /
    // `datetime` only.
    expect(parseMetaDate("14:30")).toBeNull();
    expect(parseMetaDate("14:30:00")).toBeNull();
  });

  test("returns null for syntactically-valid but semantically-invalid dates", () => {
    // `2026-13-99` matches the regex but `new Date` produces Invalid.
    expect(parseMetaDate("2026-13-99")).toBeNull();
  });
});
