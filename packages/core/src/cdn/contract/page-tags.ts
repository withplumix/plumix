import { normalizeTag } from "./tags.js";

/**
 * Keyed on the request memo, not the context: derived contexts are spreads, so
 * a write against one would land in an accumulator nothing reads.
 */
const pending = new WeakMap<WeakKey, Set<string>>();

/** A memo wrapping another, mapped to the request memo it wraps. */
const wrapped = new WeakMap<WeakKey, WeakKey>();

/**
 * Tags declared through `memo` go on `requestMemo`'s response: a reader with a
 * memo of its own still reads for the request.
 */
export function declareThrough(memo: WeakKey, requestMemo: WeakKey): void {
  wrapped.set(memo, requestMemo);
}

function requestMemoOf(memo: WeakKey): WeakKey {
  return wrapped.get(memo) ?? memo;
}

/** Add `tags` to what this request's response is stored under. */
export function declarePageTags(
  ctx: { readonly memo: WeakKey },
  tags: readonly string[],
): void {
  if (tags.length === 0) return;
  const memo = requestMemoOf(ctx.memo);
  let set = pending.get(memo);
  if (set === undefined) {
    set = new Set();
    pending.set(memo, set);
  }
  for (const tag of tags) set.add(normalizeTag(tag));
}

/** The de-duplicated tags declared for this request, in insertion order. */
export function declaredPageTags(ctx: {
  readonly memo: WeakKey;
}): readonly string[] {
  const set = pending.get(requestMemoOf(ctx.memo));
  return set === undefined ? [] : [...set];
}
