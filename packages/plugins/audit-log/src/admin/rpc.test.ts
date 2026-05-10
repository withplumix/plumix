import { describe, expect, test } from "vitest";

import { presetToRange } from "./rpc.js";

describe("presetToRange", () => {
  const now = new Date("2026-05-10T18:30:00Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);

  test("today returns [00:00 UTC, now]", () => {
    const range = presetToRange("today", now);
    const dayStart = Math.floor(
      new Date("2026-05-10T00:00:00Z").getTime() / 1000,
    );
    expect(range).toEqual({
      occurredAfter: dayStart,
      occurredBefore: nowSeconds,
    });
  });

  test("last7 spans 7 days ending now", () => {
    const range = presetToRange("last7", now);
    const expected = Math.floor(
      new Date("2026-05-03T18:30:00Z").getTime() / 1000,
    );
    expect(range.occurredAfter).toBe(expected);
    expect(range.occurredBefore).toBe(nowSeconds);
  });

  test("last30 spans 30 days ending now", () => {
    const range = presetToRange("last30", now);
    const expected = Math.floor(
      new Date("2026-04-10T18:30:00Z").getTime() / 1000,
    );
    expect(range.occurredAfter).toBe(expected);
    expect(range.occurredBefore).toBe(nowSeconds);
  });

  test("custom returns empty object — caller supplies bounds", () => {
    expect(presetToRange("custom", now)).toEqual({});
  });
});
