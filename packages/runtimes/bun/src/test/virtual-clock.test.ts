import { describe, expect, test } from "vitest";

import { virtualClock } from "./virtual-clock.js";

describe("virtualClock", () => {
  test("advancing wakes the sleepers due by then in due order, at their due time, and leaves a later one asleep", async () => {
    const clock = virtualClock("2026-10-13T10:00:00Z");
    const woke: string[] = [];
    void clock.sleep(2_000).then(() => woke.push(`two at ${clock.now()}`));
    void clock.sleep(1_000).then(() => woke.push(`one at ${clock.now()}`));
    void clock.sleep(5_000).then(() => woke.push("five"));

    await clock.advanceTo("2026-10-13T10:00:03Z");

    expect(woke).toEqual([
      `one at ${Date.parse("2026-10-13T10:00:01Z")}`,
      `two at ${Date.parse("2026-10-13T10:00:02Z")}`,
    ]);
    expect(clock.now()).toBe(Date.parse("2026-10-13T10:00:03Z"));
    expect(clock.sleeping()).toBe(1);
  });

  test("counts what sleeps on it, so a test can wait until the code it drives does", () => {
    const clock = virtualClock("2026-10-13T10:00:00Z");

    void clock.sleep(1_000);

    expect(clock.sleeping()).toBe(1);
  });
});
