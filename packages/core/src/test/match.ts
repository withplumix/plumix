// Runner-agnostic deep equality helpers used by the test DX kit. Kept
// deliberately minimal — we don't want to ship a competitor to chai/expect,
// just enough to let TestResponse and expectError work without importing
// vitest.

/**
 * Strict deep equality. Arrays, plain objects, and primitives only —
 * Date compares via getTime; everything else falls back to Object.is.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (
      !deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Partial-match: every key in `expected` must be deepEqual to the same key
 * in `actual`, but `actual` may have extra keys. For arrays, length must
 * match and each element is recursively partial-matched. Mirrors
 * `expect.toMatchObject` semantics, at a level of rigor that's good enough
 * for test-harness assertions.
 */
export function partialMatch(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (expected instanceof Date) {
    return actual instanceof Date && actual.getTime() === expected.getTime();
  }
  if (typeof expected !== "object" || expected === null) {
    return Object.is(actual, expected);
  }
  if (typeof actual !== "object" || actual === null) return false;

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return false;
    }
    for (let i = 0; i < expected.length; i++) {
      if (!partialMatch(actual[i], expected[i])) return false;
    }
    return true;
  }
  if (Array.isArray(actual)) return false;

  for (const key of Object.keys(expected)) {
    const expectedValue = (expected as Record<string, unknown>)[key];
    if (!Object.prototype.hasOwnProperty.call(actual, key)) return false;
    if (
      !partialMatch((actual as Record<string, unknown>)[key], expectedValue)
    ) {
      return false;
    }
  }
  return true;
}
