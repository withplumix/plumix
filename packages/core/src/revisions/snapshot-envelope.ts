// The `__plumix_*` meta-key namespace is reserved for framework use —
// plugin / theme code must not author keys under it, and meta-box
// fields cannot use this prefix.
export const SNAPSHOT_META_KEY = "__plumix_snapshot";

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
