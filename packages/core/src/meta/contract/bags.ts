// The meta bag shapes a read surface hands back, apart from the pipeline in
// `meta/` that fills them, so a contract can name them.

/**
 * Not JSON: `decodeMetaBag` yields `Date`s and `resolveMetaBags` hydrates
 * references into whatever their lookup adapter returns.
 */
export type ResolvedMeta = Record<string, unknown>;

/**
 * Not JSON: a targeted rule replaces this property with `StoredMetaOf`, whose
 * optional and `json()` fields have no arm in `JsonValue`.
 */
export type StoredMeta = Record<string, unknown>;

/**
 * A row as a read surface hands it back: the stored row with `meta` replaced
 * by its {@link ResolvedMeta} counterpart.
 */
export type WithResolvedMeta<T> = Omit<T, "meta"> & {
  readonly meta: ResolvedMeta;
};
