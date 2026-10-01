import { normalizeTag } from "./tags.js";

// Per-request accumulator of the cache tags the response is stored under,
// beyond what its route intent names. Everything that learns mid-request what
// the response read writes here: a plugin's `tagCdnEntry`, core's
// embedded-reference fold (#1508), a custom archive's `result.tags`, and the
// settings loader. The read-through reads it once the render has returned —
// a public page unions it with its intent's tags, a `cacheable` plugin route
// stores under it alone.
//
// Keyed on the request's memo rather than on the context itself: core derives
// contexts by spreading (basePath stripping, `withUser`, the formPost session
// swap), so a write made against a derived one would otherwise fill an
// accumulator nothing reads — and store untagged with no way to notice. The
// memo is one object per request, carried by reference through every
// derivation, and GC'd with it. Surfaces that never store (admin, REST)
// populate it harmlessly and drop it.
//
// `memo` is typed only as the key it is, so this contract stays below
// `context/`, whose memo already speaks this folder's tag vocabulary.
const pending = new WeakMap<WeakKey, Set<string>>();

/** Add `tags` to what this request's response is stored under. */
export function declarePageTags(
  ctx: { readonly memo: WeakKey },
  tags: readonly string[],
): void {
  if (tags.length === 0) return;
  let set = pending.get(ctx.memo);
  if (set === undefined) {
    set = new Set();
    pending.set(ctx.memo, set);
  }
  for (const tag of tags) set.add(normalizeTag(tag));
}

/** The de-duplicated tags declared for this request, in insertion order. */
export function declaredPageTags(ctx: {
  readonly memo: WeakKey;
}): readonly string[] {
  const set = pending.get(ctx.memo);
  return set === undefined ? [] : [...set];
}
