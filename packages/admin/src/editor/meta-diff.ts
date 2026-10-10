import type { JsonObject, ResolvedMeta } from "@plumix/core";

/**
 * Structural equality via canonical JSON — meta values are plain
 * JSON (strings, numbers, booleans, nested objects/arrays), so a
 * stable-key stringify is enough to compare them order-insensitively.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const record = val as JsonObject;
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, record[key]]),
      );
    }
    return val;
  });
}

/**
 * Removed keys map to `null`. Sending the whole bag would re-validate foreign
 * keys, and an unregistered one fails the entire write.
 */
export function diffMetaBag(
  prev: ResolvedMeta,
  next: ResolvedMeta,
): ResolvedMeta {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (stableStringify(next[key]) !== stableStringify(prev[key])) {
      patch[key] = next[key];
    }
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next)) patch[key] = null;
  }
  return patch;
}
