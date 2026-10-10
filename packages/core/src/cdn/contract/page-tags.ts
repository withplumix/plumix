import { normalizeTag } from "./tags.js";

/**
 * Keyed on the request memo, not the context: derived contexts are spreads, so
 * a write against one would land in an accumulator nothing reads.
 */
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
