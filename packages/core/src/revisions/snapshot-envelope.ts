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

interface SnapshotEnvelope {
  readonly slug: string;
  readonly parentId: number | null;
}

export function encodeSnapshotEnvelope(envelope: SnapshotEnvelope): {
  readonly [SNAPSHOT_META_KEY]: SnapshotEnvelope;
} {
  return { [SNAPSHOT_META_KEY]: envelope };
}

export function decodeSnapshotEnvelope(
  meta: Readonly<Record<string, unknown>>,
): SnapshotEnvelope | undefined {
  const raw = meta[SNAPSHOT_META_KEY];
  if (typeof raw !== "object" || raw === null) return undefined;
  const { slug, parentId } = raw as { slug?: unknown; parentId?: unknown };
  if (typeof slug !== "string" || slug.length === 0) return undefined;
  if (parentId !== null && typeof parentId !== "number") return undefined;
  return { slug, parentId };
}

/**
 * Drop the framework-reserved `__plumix_*` keys (snapshot envelope, revision
 * message) so an autosave's meta matches the live row's user-meta shape —
 * used when overlaying an autosave onto a row for preview render. Keys named
 * in `keep` are exempted: the preview path keeps `__plumix_template` so an
 * unsaved named-template choice still drives template resolution.
 */
export function stripReservedMeta(
  meta: Readonly<Record<string, unknown>>,
  keep: readonly string[] = [],
): Record<string, unknown> {
  const kept = new Set(keep);
  return Object.fromEntries(
    Object.entries(meta).filter(
      ([key]) => kept.has(key) || !key.startsWith(RESERVED_META_PREFIX),
    ),
  );
}

export function decodeRevisionMessage(
  meta: Readonly<Record<string, unknown>>,
): string | null {
  const raw = meta[REVISION_MESSAGE_META_KEY];
  // Treat both missing and empty string as "no message" so callers
  // get a stable `null | string` discriminator without an empty-string
  // edge case downstream.
  if (typeof raw !== "string" || raw.length === 0) return null;
  return raw;
}
