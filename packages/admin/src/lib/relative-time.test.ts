import { describe, expect, test } from "vitest";

import { formatRelativeTime } from "./relative-time.js";

const NOW = new Date("2026-05-20T12:00:00Z");

describe("formatRelativeTime", () => {
  test("returns 'now' for the present moment", () => {
    expect(formatRelativeTime(NOW, NOW)).toContain("now");
  });

  test("renders minutes-ago", () => {
    const earlier = new Date(NOW.getTime() - 5 * 60_000);
    expect(formatRelativeTime(earlier, NOW)).toMatch(/5.*minute/);
  });

  test("renders hours-ago", () => {
    const earlier = new Date(NOW.getTime() - 3 * 3_600_000);
    expect(formatRelativeTime(earlier, NOW)).toMatch(/3.*hour/);
  });
});
