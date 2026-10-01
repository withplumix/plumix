// The meta bag shapes a read surface hands back, apart from the pipeline in
// `meta/` that fills them, so a contract can name them.

/**
 * A meta bag on the read side. Not JSON: `decodeMetaBag` hands a
 * `.returns("date")` field back as a `Date`, and `resolveMetaBags` hydrates a
 * reference's stored id into whatever its lookup adapter returns, so the bag
 * stays open. The stored counterpart is {@link StoredMeta}.
 */
export type ResolvedMeta = Record<string, unknown>;

/**
 * A meta bag on the stored side — the `meta` JSON column as the row holds it.
 * Not JSON: the values are, but a targeted rule replaces this property with
 * `StoredMetaOf`, which is not. That fold types a field the author did not
 * mark `.required()` as `T | undefined`, and a `json()` or `richtext()` field
 * as `unknown` — neither has an arm in `JsonValue`, so it cannot narrow a
 * `JsonObject`. Open here is what buys the typed read there, as
 * {@link ResolvedMeta} does for `meta`.
 */
export type StoredMeta = Record<string, unknown>;

/**
 * A row as a read surface hands it back: the stored row with `meta` replaced
 * by its {@link ResolvedMeta} counterpart.
 */
export type WithResolvedMeta<T> = Omit<T, "meta"> & {
  readonly meta: ResolvedMeta;
};
