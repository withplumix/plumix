import { describe, expect, test } from "vitest";

describe("baseConfig", () => {
  test("a test reads dates in UTC whatever the machine's timezone", () => {
    expect(new Date("2026-05-20T09:05:00Z").getHours()).toBe(9);
  });
});
