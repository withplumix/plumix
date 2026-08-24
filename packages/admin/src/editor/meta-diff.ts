import type { JsonObject, ResolvedMeta } from "@plumix/core";

// Structural equality via canonical JSON — meta values are plain
// JSON (strings, numbers, booleans, nested objects/arrays), so a
// stable-key stringify is enough to compare them order-insensitively.
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
 * Diff two meta bags into a minimal write patch: only the keys whose value
 * changed (added or edited) plus `null` for keys that were removed. Keys
 * present-and-equal in both are omitted.
 *
 * The editor form carries the entry's whole meta bag — including keys the
 * editor never renders or owns (e.g. `featuredImage` written by the media
 * plugin / seed). Sending the whole bag on every autosave re-validates those
 * foreign keys, and an unregistered one fails the entire write
 * (`meta_not_registered`), silently dropping the edit. Sending only the diff
 * leaves untouched foreign keys alone — the meta write is a patch, so omitted
 * keys persist unchanged.
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
