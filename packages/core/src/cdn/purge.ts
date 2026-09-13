import type { AppContext } from "../context/app.js";
import type { RequestMemo } from "../context/memo.js";
import type { HookRegistry } from "../hooks/registry.js";
import { entryPurgeTags, normalizeTag, termPurgeTags } from "./tags.js";

// Per-request purge accumulator. Entry hooks fire one at a time during a
// request (a bulk publish fires N), each adding tags here; the dispatcher
// flushes once after the request so the whole mutation costs a single
// purge call.
//
// Keyed on the request's memo rather than on the context itself, for the reason
// `route-tags.ts` is: core derives contexts by spreading (basePath stripping,
// `withUser`, the formPost session swap), and the flush runs against the
// outermost one — so a listener that enqueued against a derived context would
// fill a set nothing reads, and skip the purge with no way to notice. The memo
// is one object per request, carried by reference through every derivation, and
// GC'd with it.
const pending = new WeakMap<RequestMemo, Set<string>>();

export function enqueuePurgeTags(
  ctx: AppContext,
  tags: readonly string[],
): void {
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

/**
 * Register core's CDN purge subscribers. Called at app boot when a
 * cdn slot is configured; each entry mutation enqueues `t:<type>` + `e:<id>`,
 * each term mutation enqueues `t:<type>` for the taxonomy's entry types, for
 * the post-request flush.
 */
export function registerCorePurgeInvalidator(hooks: HookRegistry): void {
  // Entry lifecycle actions that change what the public sees — published,
  // edited, meta-changed, or removed from view (trash/delete) / restored. Every
  // payload's leading arg carries `{ id, type }`.
  const onEntry = (
    entry: { readonly id: number; readonly type: string },
    ctx: AppContext,
  ): void => {
    enqueuePurgeTags(ctx, entryPurgeTags(entry.type, entry.id));
  };
  hooks.addAction("entry:published", onEntry);
  hooks.addAction("entry:trashed", onEntry);
  hooks.addAction("entry:restored", onEntry);
  hooks.addAction("entry:deleted", onEntry);
  hooks.addAction("entry:updated", (entry, _previous, ctx) =>
    onEntry(entry, ctx),
  );
  hooks.addAction("entry:meta_changed", (entry, _changes, ctx) =>
    onEntry(entry, ctx),
  );

  // Term lifecycle actions whose payload's leading arg carries `{ taxonomy }`.
  // A term archive is stored under the `t:<type>` tags of its taxonomy's entry
  // types, so creating, renaming, meta-changing, or deleting a term purges those.
  const onTerm = (
    term: { readonly taxonomy: string },
    ctx: AppContext,
  ): void => {
    const entryTypes =
      ctx.plugins.termTaxonomies.get(term.taxonomy)?.entryTypes ?? [];
    enqueuePurgeTags(ctx, termPurgeTags(entryTypes));
  };
  hooks.addAction("term:created", onTerm);
  hooks.addAction("term:deleted", onTerm);
  hooks.addAction("term:updated", (term, _previous, ctx) => onTerm(term, ctx));
  hooks.addAction("term:meta_changed", (term, _changes, ctx) =>
    onTerm(term, ctx),
  );
}
