import { describe, expect, test } from "vitest";

import { applyModerationVerdict, decideBaselineStatus } from "./moderation.js";

describe("decideBaselineStatus", () => {
  test("logged-in users are approved regardless of mode", () => {
    expect(
      decideBaselineStatus({
        mode: "all",
        priorApprovedCount: 0,
        isAuthenticated: true,
      }),
    ).toBe("approved");
  });

  test("mode 'none' approves anonymous comments", () => {
    expect(
      decideBaselineStatus({
        mode: "none",
        priorApprovedCount: 0,
        isAuthenticated: false,
      }),
    ).toBe("approved");
  });

  test("mode 'all' holds anonymous comments as pending", () => {
    expect(
      decideBaselineStatus({
        mode: "all",
        priorApprovedCount: 5,
        isAuthenticated: false,
      }),
    ).toBe("pending");
  });

  test("mode 'first_time' holds a new email as pending", () => {
    expect(
      decideBaselineStatus({
        mode: "first_time",
        priorApprovedCount: 0,
        isAuthenticated: false,
      }),
    ).toBe("pending");
  });

  test("mode 'first_time' approves an email with a prior approved comment", () => {
    expect(
      decideBaselineStatus({
        mode: "first_time",
        priorApprovedCount: 1,
        isAuthenticated: false,
      }),
    ).toBe("approved");
  });
});

describe("applyModerationVerdict", () => {
  test("a filter may demote toward spam", () => {
    expect(applyModerationVerdict("approved", "spam")).toBe("spam");
    expect(applyModerationVerdict("pending", "trash")).toBe("trash");
  });

  test("a filter may not promote (most-restrictive wins)", () => {
    expect(applyModerationVerdict("pending", "approved")).toBe("pending");
    expect(applyModerationVerdict("spam", "approved")).toBe("spam");
  });

  test("keeps the baseline when the verdict matches it", () => {
    expect(applyModerationVerdict("approved", "approved")).toBe("approved");
  });

  test("ignores a verdict that isn't a known status", () => {
    expect(applyModerationVerdict("pending", "garbage")).toBe("pending");
    expect(applyModerationVerdict("approved", undefined)).toBe("approved");
    expect(applyModerationVerdict("pending", 42)).toBe("pending");
  });
});
