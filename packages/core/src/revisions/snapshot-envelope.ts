import type { JsonObject, JsonValue } from "../json.js";

// The `__plumix_*` meta-key namespace is reserved for framework use —
// plugin / theme code must not author keys under it, and meta-box
// fields cannot use this prefix.
const RESERVED_META_PREFIX = "__plumix_";

export const SNAPSHOT_META_KEY = "__plumix_snapshot";

// A separate key so it can be patched without round-tripping the snapshot
// envelope.
export const REVISION_MESSAGE_META_KEY = "__plumix_revision_message";

// Soft cap on author-typed labels. Long enough for one sentence, short
// enough to render inline without truncating the row UI.
export const REVISION_MESSAGE_MAX_LENGTH = 280;

// A `type`, not an `interface`, so it assigns to `JsonObject` inside the
// stored meta bag.
type SnapshotEnvelope = Readonly<{
  slug: string;
  parentId: number | null;
  // Keys the author cleared. An autosave's meta holds the keys the author
  // touched (ADR 0003), where absence means untouched — so a cleared field has
  // nowhere to live but here.
  deletes: readonly string[];
}>;

// `deletes` is absent on a revision, which is a whole snapshot with nothing to
// clear, and on older envelopes.
type StoredSnapshotEnvelope = Readonly<{
  slug: string;
  parentId: number | null;
  deletes?: readonly string[];
}>;

export function encodeSnapshotEnvelope(envelope: StoredSnapshotEnvelope): {
  readonly [SNAPSHOT_META_KEY]: StoredSnapshotEnvelope;
} {
  const { slug, parentId, deletes } = envelope;
  return {
    [SNAPSHOT_META_KEY]:
      deletes && deletes.length > 0
        ? { slug, parentId, deletes }
        : { slug, parentId },
  };
}

// `Array.isArray` widens its subject to `any[]`, so the element check has to
// carry a predicate or the filtered result assigns to `string[]` unexamined.
function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function decodeSnapshotEnvelope(
  meta: JsonObject,
): SnapshotEnvelope | undefined {
  const raw = meta[SNAPSHOT_META_KEY];
  if (typeof raw !== "object" || raw === null) return undefined;
  const { slug, parentId, deletes } = raw as {
    slug?: unknown;
    parentId?: unknown;
    deletes?: unknown;
  };
  if (typeof slug !== "string" || slug.length === 0) return undefined;
  if (parentId !== null && typeof parentId !== "number") return undefined;
  return {
    slug,
    parentId,
    // An older envelope's meta is a whole copy of the row, so every key reads
    // as touched.
    deletes: Array.isArray(deletes) ? deletes.filter(isString) : [],
  };
}

/**
 * Cleared keys come out and touched keys go on top. Reserved keys ride along
 * from the autosave, so an unsaved template pick still drives a preview.
 */
export function mergeAutosaveMeta(
  liveMeta: JsonObject,
  autosaveMeta: JsonObject,
): JsonObject {
  const merged: Record<string, JsonValue> = { ...liveMeta };
  for (const key of decodeSnapshotEnvelope(autosaveMeta)?.deletes ?? []) {
    delete merged[key];
  }
  return { ...merged, ...autosaveMeta };
}

/**
 * Everything rendering a pending draft goes through here, so one row never
 * means two things.
 */
export function asDraftRow<T extends { readonly meta: JsonObject }>(
  live: { readonly meta: JsonObject },
  autosave: T,
): T {
  return { ...autosave, meta: mergeAutosaveMeta(live.meta, autosave.meta) };
}

/**
 * Set and cleared keys, excluding reserved `__plumix_*` ones, which no
 * meta-box field can be named.
 */
export function autosaveTouchedKeys(autosaveMeta: JsonObject): Set<string> {
  const cleared = decodeSnapshotEnvelope(autosaveMeta)?.deletes ?? [];
  return new Set([
    ...Object.keys(stripReservedMeta(autosaveMeta)),
    ...cleared.filter((key) => !key.startsWith(RESERVED_META_PREFIX)),
  ]);
}

/**
 * Keys in `keep` are exempted, as preview keeps `__plumix_template` so an
 * unsaved template choice still drives resolution.
 */
export function stripReservedMeta(
  meta: JsonObject,
  keep: readonly string[] = [],
): JsonObject {
  const kept = new Set(keep);
  return Object.fromEntries(
    Object.entries(meta).filter(
      ([key]) => kept.has(key) || !key.startsWith(RESERVED_META_PREFIX),
    ),
  );
}

export function decodeRevisionMessage(meta: JsonObject): string | null {
  const raw = meta[REVISION_MESSAGE_META_KEY];
  // Treat both missing and empty string as "no message" so callers
  // get a stable `null | string` discriminator without an empty-string
  // edge case downstream.
  if (typeof raw !== "string" || raw.length === 0) return null;
  return raw;
}
