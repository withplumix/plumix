import type { AppContext } from "../context/app.js";
import type { RequestMemo } from "../context/memo.js";

// Per-request tag accumulator for a `cacheable: true` plugin route. The
// handler names what its response depends on while it runs; the read-through
// reads the set once the handler has returned, which is the only moment both
// the tags and the response exist.
//
// Keyed on the request's memo rather than on the context itself: core derives
// contexts by spreading (`stripBasePathOrReject`, `withUser`), so a handler
// that was handed a derived one would otherwise fill an accumulator nothing
// reads — and store untagged with no way to notice. The memo is one object per
// request, carried by reference through every derivation, and GC'd with it.
const pending = new WeakMap<RequestMemo, Set<string>>();

/**
 * Declare the cache tags this request's response should be stored under —
 * `entryTag`/`typeTag` are the vocabulary core purges by, so a card tagged
 * `e:<id>` is cleared by the same publish that clears the entry's page.
 *
 * Only a route registered with `cacheable: true` is stored at all, and only a
 * handler knows what its own response read, so the claim is the route's to
 * make. Calling it twice in a request unions the tags; calling it on a route
 * that never reaches the edge cache does nothing.
 */
export function tagCacheEntry(ctx: AppContext, tags: readonly string[]): void {
  if (ctx.cache === undefined || tags.length === 0) return;
  let set = pending.get(ctx.memo);
  if (set === undefined) {
    set = new Set();
    pending.set(ctx.memo, set);
  }
  for (const tag of tags) set.add(tag);
}

/** What the handler declared, for the store that is about to happen. */
export function cacheTagsFor(ctx: AppContext): string[] {
  return [...(pending.get(ctx.memo) ?? [])];
}
