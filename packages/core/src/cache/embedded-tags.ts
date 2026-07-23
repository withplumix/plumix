import type { AppContext } from "../context/app.js";

// Per-request accumulator of cache tags for entities embedded into a page
// via read-time reference hydration (#1508). When hydration resolves a
// referenced entity, the resolving adapter contributes the tag that
// entity's purge would enqueue (an entry contributes `e:<id>`); the public
// dispatcher folds the accumulated set into the page's stored cache tags,
// so editing or deleting an embedded entity purges the pages that embedded
// it. Keyed off the request's `Request` (GC'd with the request, no manual
// cleanup): the render rebinds `ctx` through `withUser` for sessioned
// requests — a fresh object that shares the same `request` — so keying on
// the `AppContext` would strand tags accumulated after the rebind. The
// public read-through is the only reader; other surfaces (admin, REST)
// populate a distinct request's accumulator harmlessly and drop it.
const pending = new WeakMap<Request, Set<string>>();

export function accumulateEmbeddedTags(
  ctx: AppContext,
  tags: readonly string[],
): void {
  if (tags.length === 0) return;
  let set = pending.get(ctx.request);
  if (set === undefined) {
    set = new Set();
    pending.set(ctx.request, set);
  }
  for (const tag of tags) set.add(tag);
}

/** The de-duplicated tags accumulated for this request, in insertion order. */
export function embeddedPageTags(ctx: AppContext): readonly string[] {
  const set = pending.get(ctx.request);
  return set === undefined ? [] : [...set];
}
