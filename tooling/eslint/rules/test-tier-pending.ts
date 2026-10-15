/**
 * Tests ADR 0042 retires, still awaiting their move to the unit, e2e or smoke
 * tier (#3035, #3036). Hand-authored: a migration only removes entries, and the
 * list is done when empty.
 */
export const RETIRED_TIER_PENDING: readonly string[] = [
  "packages/plumix/src/test/node-only.browser.test.ts",
];
