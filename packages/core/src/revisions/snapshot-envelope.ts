import type { JsonObject, JsonValue } from "../json.js";

// The `__plumix_*` meta-key namespace is reserved for framework use —
// plugin / theme code must not author keys under it, and meta-box
// fields cannot use this prefix.
const RESERVED_META_PREFIX = "__plumix_";

export const SNAPSHOT_META_KEY = "__plumix_snapshot";

// Author-supplied label for a revision (Builder.io's "Comment" icon).
// Lives under a separate envelope key so it can be patched in isolation
// — no need to round-trip the whole snapshot envelope on every edit.
export const REVISION_MESSAGE_META_KEY = "__plumix_revision_message";

// Soft cap on author-typed labels. Long enough for one sentence, short
// enough to render inline without truncating the row UI.
export const REVISION_MESSAGE_MAX_LENGTH = 280;

// Spelled as a `type`, not an `interface`: TypeScript withholds the implicit
// index signature from an interface, so an interface never assigns to
// `JsonObject` however JSON-shaped its members are — and this envelope rides
// inside the stored meta bag.
type SnapshotEnvelope = Readonly<{
  slug: string;
  parentId: number | null;
  // Keys the author cleared. An autosave's meta holds the keys the author
  // touched (ADR 0003), where absence means untouched — so a cleared field has
  // nowhere to live but here.
  deletes: readonly string[];
}>;

// As it sits in the column. `deletes` is absent rather than empty on a revision,
// which is a whole snapshot and so has nothing to clear — that is also the shape
// every envelope written before ADR 0003 already has, so neither needs rewriting.
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
    // An envelope written before ADR 0003 has no `deletes`, and its meta is a
    // whole copy of the row rather than a patch — every key reads as touched,
    // which is the pre-ADR behaviour, and it clears as the draft is published.
    deletes: Array.isArray(deletes) ? deletes.filter(isString) : [],
  };
}

/**
 * Lay an autosave's edits over the live row's meta: the keys the author cleared
 * come out, the keys they touched go on top. Reserved keys ride along from the
 * autosave, so an unsaved template pick still drives a preview.
 *
 * This is what makes an autosave readable as a whole draft row even though it
 * stores only a patch — see {@link getAutosave}, which is where callers get it.
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
 * An autosave row read as the draft it represents, with its edits laid over the
 * live entry. Everything that renders or returns a pending draft goes through
 * here, so one row never reaches two surfaces meaning different things.
 */
export function asDraftRow<T extends { readonly meta: JsonObject }>(
  live: { readonly meta: JsonObject },
  autosave: T,
): T {
  return { ...autosave, meta: mergeAutosaveMeta(live.meta, autosave.meta) };
}

/**
 * The meta keys an autosave's author actually wrote — the ones they set and the
 * ones they cleared. Promotion runs the field pipeline over exactly these, so a
 * value nobody submitted is never re-decoded (ADR 0003).
 *
 * Reserved keys are excluded: no meta-box field can be named under the
 * `__plumix_*` prefix, so naming one here would claim an authored key that
 * cannot exist.
 */
export function autosaveTouchedKeys(autosaveMeta: JsonObject): Set<string> {
  const cleared = decodeSnapshotEnvelope(autosaveMeta)?.deletes ?? [];
  return new Set([
    ...Object.keys(stripReservedMeta(autosaveMeta)),
    ...cleared.filter((key) => !key.startsWith(RESERVED_META_PREFIX)),
  ]);
}

/**
 * Drop the framework-reserved `__plumix_*` keys (snapshot envelope, revision
 * message) so an autosave's meta matches the live row's user-meta shape —
 * used when overlaying an autosave onto a row for preview render. Keys named
 * in `keep` are exempted: the preview path keeps `__plumix_template` so an
 * unsaved named-template choice still drives template resolution.
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
