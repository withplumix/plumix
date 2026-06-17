import type { AppContext } from "../context/app.js";
import type { HookRegistry } from "../hooks/registry.js";
import { tryGetContext } from "../context/stores.js";
import { entryPurgeTags, termPurgeTags } from "./tags.js";

// Per-request purge accumulator. Entry hooks fire one at a time during a
// request (a bulk publish fires N), each adding tags here; the dispatcher
// flushes once after the request so the whole mutation costs a single
// purge call. Keyed off the request `AppContext`, which is GC'd with the
// request — no manual cleanup needed beyond the flush's own delete.
const pending = new WeakMap<AppContext, Set<string>>();

export function enqueuePurgeTags(
  ctx: AppContext,
  tags: readonly string[],
): void {
  if (ctx.cache === undefined || tags.length === 0) return;
  let set = pending.get(ctx);
  if (set === undefined) {
    set = new Set();
    pending.set(ctx, set);
  }
  for (const tag of tags) set.add(tag);
}

/**
 * Runs through `ctx.defer` so the purge never blocks the response, and
 * `defer`'s own rejection handler logs a failed purge — a publish never fails
 * because Cloudflare's purge API hiccupped; TTL/SWR is the backstop.
 */
export function flushPurgeTags(ctx: AppContext): void {
  const set = pending.get(ctx);
  if (set === undefined) return;
  pending.delete(ctx);
  const cache = ctx.cache;
  if (cache === undefined || set.size === 0) return;
  ctx.defer(cache.purgeTags([...set]));
}

// Entry lifecycle actions that change what the public sees — published,
// edited, meta-changed, or removed from view (trash/delete) / restored. Every
// payload's leading arg carries `{ id, type }`, so one handler serves them all.
const ENTRY_ACTIONS = [
  "entry:published",
  "entry:updated",
  "entry:meta_changed",
  "entry:trashed",
  "entry:restored",
  "entry:deleted",
] as const;

// Term lifecycle actions whose payload's leading arg carries `{ taxonomy }`.
// A term archive is stored under the `t:<type>` tags of its taxonomy's entry
// types, so creating, renaming, meta-changing, or deleting a term busts those.
const TERM_ACTIONS = [
  "term:created",
  "term:updated",
  "term:meta_changed",
  "term:deleted",
] as const;

/**
 * Register core's edge-cache purge subscribers. Called at app boot when a
 * cache slot is configured; each entry mutation enqueues `t:<type>` + `e:<id>`,
 * each term mutation enqueues `t:<type>` for the taxonomy's entry types, for
 * the post-request flush.
 */
export function registerCorePurgeInvalidator(hooks: HookRegistry): void {
  const onEntry = (entry: { readonly id: number; readonly type: string }) => {
    const ctx = tryGetContext();
    if (ctx === null) return;
    enqueuePurgeTags(ctx, entryPurgeTags(entry.type, entry.id));
  };
  for (const action of ENTRY_ACTIONS) {
    hooks.addAction(action as never, onEntry);
  }

  const onTerm = (term: { readonly taxonomy: string }) => {
    const ctx = tryGetContext();
    if (ctx === null) return;
    const entryTypes =
      ctx.plugins.termTaxonomies.get(term.taxonomy)?.entryTypes ?? [];
    enqueuePurgeTags(ctx, termPurgeTags(entryTypes));
  };
  for (const action of TERM_ACTIONS) {
    hooks.addAction(action as never, onTerm as never);
  }
}
