import { describe, expect, test, vi } from "vitest";

import { assertExpectedLiveUpdatedAt } from "./concurrency.js";

describe("assertExpectedLiveUpdatedAt", () => {
  test("undefined expected token is a no-op (legacy callers)", () => {
    const stale = vi.fn(() => {
      throw new Error("should not be called");
    });
    expect(() =>
      assertExpectedLiveUpdatedAt(undefined, new Date(), { stale }),
    ).not.toThrow();
    expect(stale).not.toHaveBeenCalled();
  });

  test("matching timestamps are a no-op even when Date identity differs", () => {
    const t = new Date("2026-01-01T12:00:00Z");
    const stale = vi.fn(() => {
      throw new Error("should not be called");
    });
    expect(() =>
      assertExpectedLiveUpdatedAt(t, new Date(t.getTime()), { stale }),
    ).not.toThrow();
    expect(stale).not.toHaveBeenCalled();
  });

  test("mismatched timestamps invoke the stale guard", () => {
    const expected = new Date("2026-01-01T12:00:00Z");
    const current = new Date("2026-01-01T12:00:01Z");
    const stale = vi.fn(() => {
      throw new Error("CONFLICT");
    });
    expect(() =>
      assertExpectedLiveUpdatedAt(expected, current, { stale }),
    ).toThrow("CONFLICT");
    expect(stale).toHaveBeenCalledTimes(1);
  });

  test("one-millisecond difference is a mismatch", () => {
    const expected = new Date(1_700_000_000_000);
    const current = new Date(1_700_000_000_001);
    const stale = vi.fn(() => {
      throw new Error("CONFLICT");
    });
    expect(() =>
      assertExpectedLiveUpdatedAt(expected, current, { stale }),
    ).toThrow("CONFLICT");
    expect(stale).toHaveBeenCalledTimes(1);
  });
});
