import type { AppContext } from "../context/app-context.js";
import type { RequestMemo } from "../context/memo.js";
import { normalizeTag } from "./contract/tags.js";

// Per-request purge accumulator. Entry hooks fire one at a time during a
// request (a bulk publish fires N), each adding tags here; the dispatcher
// flushes once after the request so the whole mutation costs a single
// purge call.
//
// Keyed on the request's memo rather than on the context itself, for the reason
// `contract/page-tags.ts` is: core derives contexts by spreading (basePath stripping,
// `withUser`, the formPost session swap), and the flush runs against the
// outermost one — so a listener that enqueued against a derived context would
// fill a set nothing reads, and skip the purge with no way to notice. The memo
// is one object per request, carried by reference through every derivation, and
// GC'd with it.
const pending = new WeakMap<RequestMemo, Set<string>>();

/**
 * Announce that a write changed what `tags` describe. The request memo drops
 * its entries carrying any of them straight away — a later read in the same
 * execution loads the written row (#2517) — and, where the CDN can purge by
 * tag, the tags accumulate for the post-request flush.
 */
export function enqueuePurgeTags(
  ctx: AppContext,
  tags: readonly string[],
): void {
  ctx.memo.invalidate(tags);
  // A provider that cannot invalidate by tag has no `purgeTags` at all, so
  // there is nothing to accumulate for — freshness is that site's only control.
  if (ctx.cdn?.purgeTags === undefined || tags.length === 0) return;
  let set = pending.get(ctx.memo);
  if (set === undefined) {
    set = new Set();
    pending.set(ctx.memo, set);
  }
  for (const tag of tags) set.add(normalizeTag(tag));
}

/**
 * Runs through `ctx.defer` so the purge never blocks the response, and
 * `defer`'s own rejection handler logs a failed purge — a publish never fails
 * because Cloudflare's purge API hiccupped; TTL/SWR is the backstop.
 */
export function flushPurgeTags(ctx: AppContext): void {
  const set = pending.get(ctx.memo);
  if (set === undefined) return;
  pending.delete(ctx.memo);
  const cdn = ctx.cdn;
  if (cdn?.purgeTags === undefined || set.size === 0) return;
  ctx.defer(cdn.purgeTags([...set]));
}
