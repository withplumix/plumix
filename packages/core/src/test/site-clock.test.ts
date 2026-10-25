import { describe, expect, test } from "vitest";

import { siteClock } from "./site-clock.js";

describe("a site's clock", () => {
  test("adds days, hours and minutes together", () => {
    const time = siteClock();
    const before = Date.now();

    time.travel({ days: 1, hours: 2, minutes: 3 });

    const moved = time.clock.now() - before;
    const expected = ((24 + 2) * 60 + 3) * 60_000;
    expect(moved).toBeGreaterThanOrEqual(expected);
    expect(moved).toBeLessThan(expected + 5_000);
  });

  test("moves the frozen instant when it travels", () => {
    const time = siteClock();
    time.freezeTime("2020-01-01T09:00:00Z");

    time.travel({ hours: 3 });

    expect(time.clock.now()).toBe(Date.parse("2020-01-01T12:00:00Z"));
  });

  test("returns to real time on reset", () => {
    const time = siteClock();
    time.freezeTime("2020-01-01T09:00:00Z");
    time.travel({ days: 5 });

    time.reset();

    expect(Math.abs(time.clock.now() - Date.now())).toBeLessThan(5_000);
  });
});
