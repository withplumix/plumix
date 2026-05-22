import { describe, expect, test } from "vitest";

import { detectStaleAutosave } from "./detect-stale-autosave.js";

const LIVE = new Date("2026-05-22T12:00:00Z");
const BEFORE = new Date("2026-05-22T11:00:00Z");
const AFTER = new Date("2026-05-22T13:00:00Z");
const EQUAL = new Date("2026-05-22T12:00:00Z");

describe("detectStaleAutosave", () => {
  test("returns 'none' when there is no autosave at all", () => {
    expect(detectStaleAutosave(null, LIVE)).toBe("none");
  });

  test("returns 'stale' when the autosave is older than the live row (someone else published in between)", () => {
    expect(detectStaleAutosave(BEFORE, LIVE)).toBe("stale");
  });

  test("returns 'fresh' when the autosave is newer than the live row (typical pending edit)", () => {
    expect(detectStaleAutosave(AFTER, LIVE)).toBe("fresh");
  });

  test("returns 'fresh' when the autosave timestamp equals live's (no third-party publish race)", () => {
    // Tie goes to the autosave — the user's pending work isn't
    // 'stale' relative to a live row written at the same instant
    // (in practice, the autosave is always written after live, so
    // an exact match means the autosave row was created right after
    // the load that anchored its timestamp).
    expect(detectStaleAutosave(EQUAL, LIVE)).toBe("fresh");
  });

  test("strict `<` boundary: one millisecond older counts as stale, one millisecond newer counts as fresh", () => {
    // Pins the comparison operator — flipping to `<=` would change
    // the equal-timestamps tie-break, and an off-by-one in either
    // direction would mis-classify the most common race window.
    const liveMs = LIVE.getTime();
    expect(detectStaleAutosave(new Date(liveMs - 1), LIVE)).toBe("stale");
    expect(detectStaleAutosave(new Date(liveMs + 1), LIVE)).toBe("fresh");
  });
});
