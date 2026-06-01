import { describe, expect, test } from "vitest";

import { formatDate, formatNumber, formatRelative } from "./format.js";

// `formatDate` / `formatNumber` are re-exports of Lingui's own `date` /
// `number`. We don't re-test Lingui's behavior; one smoke check on each
// confirms the re-export wiring + that locale actually threads through.
describe("formatDate / formatNumber re-exports", () => {
  test("wired and locale-aware", () => {
    const date = new Date("2026-05-31T12:00:00Z");
    // Lingui's `formats.date` defaults to en-US medium style; this
    // smoke check just confirms the re-export is live and that locale
    // actually threads through.
    expect(formatDate("en-US", date)).toBe("May 31, 2026");
    expect(formatNumber("de-DE", 1234.5)).toBe("1.234,5");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  test("picks the auto-unit at each common boundary", () => {
    const min = 60_000;
    const hr = 60 * min;
    const day = 24 * hr;
    expect(
      formatRelative("en-US", new Date(now.getTime() - 1 * min), { now }),
    ).toBe("1 minute ago");
    expect(
      formatRelative("en-US", new Date(now.getTime() - 2 * hr), { now }),
    ).toBe("2 hours ago");
    expect(
      formatRelative("en-US", new Date(now.getTime() - 3 * day), { now }),
    ).toBe("3 days ago");
    expect(
      formatRelative("en-US", new Date(now.getTime() - 400 * day), { now }),
    ).toBe("1 year ago");
  });

  test("honors numeric: 'auto' so recent points say 'yesterday'", () => {
    const day = 24 * 60 * 60_000;
    expect(
      formatRelative("en-US", new Date(now.getTime() - day), {
        now,
        numeric: "auto",
      }),
    ).toBe("yesterday");
  });

  test("formats future points with positive sign ('in N')", () => {
    const hr = 60 * 60_000;
    expect(
      formatRelative("en-US", new Date(now.getTime() + 3 * hr), { now }),
    ).toBe("in 3 hours");
  });

  test("zero-diff renders 'now' under numeric: 'auto', 'in 0 seconds' otherwise", () => {
    expect(formatRelative("en-US", now, { now })).toBe("in 0 seconds");
    expect(formatRelative("en-US", now, { now, numeric: "auto" })).toBe("now");
  });
});
