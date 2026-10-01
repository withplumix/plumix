import { describe, expect, test } from "vitest";

import { dateRange } from "./date-range.js";

const iso = (d: Date) => d.toISOString();

describe("dateRange", () => {
  test("a year spans Jan 1 to the next Jan 1 (half-open)", () => {
    const r = dateRange(2026, null, null);
    expect(r && iso(r.start)).toBe("2026-01-01T00:00:00.000Z");
    expect(r && iso(r.end)).toBe("2027-01-01T00:00:00.000Z");
  });

  test("a month spans its first day to the next month's first day", () => {
    const r = dateRange(2026, 7, null);
    expect(r && iso(r.start)).toBe("2026-07-01T00:00:00.000Z");
    expect(r && iso(r.end)).toBe("2026-08-01T00:00:00.000Z");
  });

  test("December rolls the end into the next year", () => {
    const r = dateRange(2026, 12, null);
    expect(r && iso(r.end)).toBe("2027-01-01T00:00:00.000Z");
  });

  test("a day spans one 24h window", () => {
    const r = dateRange(2026, 7, 21);
    expect(r && iso(r.start)).toBe("2026-07-21T00:00:00.000Z");
    expect(r && iso(r.end)).toBe("2026-07-22T00:00:00.000Z");
  });

  test("month-end and leap day are valid", () => {
    expect(dateRange(2026, 1, 31)).not.toBeNull();
    // 2024 is a leap year — Feb 29 exists.
    expect(dateRange(2024, 2, 29)).not.toBeNull();
  });

  test("a 0–99 year is that literal year, not 1900–1999", () => {
    // `Date.UTC(50, …)` would map to 1950; `dateRange` must keep year 50.
    const r = dateRange(50, null, null);
    expect(r && iso(r.start)).toBe("0050-01-01T00:00:00.000Z");
    expect(r && iso(r.end)).toBe("0051-01-01T00:00:00.000Z");
    // ...and the day granularity of the same year is consistent (not a 404).
    const day = dateRange(50, 3, 15);
    expect(day && iso(day.start)).toBe("0050-03-15T00:00:00.000Z");
  });

  test("impossible components return null", () => {
    expect(dateRange(2026, 0, null)).toBeNull(); // month 0
    expect(dateRange(2026, 13, null)).toBeNull(); // month 13
    expect(dateRange(2026, 2, 30)).toBeNull(); // Feb 30
    expect(dateRange(2026, 4, 31)).toBeNull(); // Apr 31
    expect(dateRange(2026, 2, 29)).toBeNull(); // 2026 not a leap year
    expect(dateRange(2026, 1, 0)).toBeNull(); // day 0
  });
});
