// Re-typing the shape we observe on `entry:meta_changed` so the hooks
// file can stay free of plumix internals. Matches `MetaChanges` in
// core's meta/core.ts.

export interface EntryMetaChanges {
  readonly set: Readonly<Record<string, unknown>>;
  readonly removed: readonly string[];
}
