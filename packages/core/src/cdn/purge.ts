import type { AppContext } from "../context/app-context.js";
import type { RequestMemo } from "../context/memo.js";
import type { HookRegistry } from "../hooks/registry.js";
import {
  publicEntryTypeNames,
  termPageEntryTypeNames,
} from "../plugin/registry.js";
import {
  entryPurgeTags,
  normalizeTag,
  settingsTag,
  termPurgeTags,
  usersPurgeTags,
  userTag,
} from "./contract/tags.js";

/**
 * Keyed on the request memo, not the context: the flush runs against the
 * outermost context, so a derived spread would fill a set nothing reads.
 */
const pending = new WeakMap<RequestMemo, Set<string>>();

/**
 * Drops matching request-memo entries immediately, so a later read sees the
 * write; the CDN purge waits for the post-request flush.
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
 * Deferred and logged on failure: a publish never fails on a purge hiccup;
 * TTL/SWR is the backstop.
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
 * Registered at every boot, CDN or not: the request memo reads the same tags.
 * Handlers stay synchronous for the memo's sake (see `RequestMemo.invalidate`).
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

  // A delete reassigns entries without an entry action, so the public types'
  // tags are what reaches the pages that printed the author.
  const onUser = (user: { readonly id: number }, ctx: AppContext): void => {
    enqueuePurgeTags(ctx, usersPurgeTags(publicEntryTypeNames(ctx.plugins)));
    ctx.memo.invalidate([userTag(user.id)]);
  };
  hooks.addAction("user:updated", (user, _previous, ctx) => onUser(user, ctx));
  hooks.addAction("user:deleted", (user, _deletion, ctx) => onUser(user, ctx));

  // A term archive is stored under its taxonomy's entry types' `t:<type>` tags.
  const onTerm = (
    term: { readonly taxonomy: string },
    ctx: AppContext,
  ): void => {
    enqueuePurgeTags(
      ctx,
      termPurgeTags(termPageEntryTypeNames(ctx.plugins, term.taxonomy)),
    );
  };
  hooks.addAction("term:created", onTerm);
  hooks.addAction("term:deleted", onTerm);
  hooks.addAction("term:updated", (term, _previous, ctx) => onTerm(term, ctx));
  hooks.addAction("term:meta_changed", (term, _changes, ctx) =>
    onTerm(term, ctx),
  );

  // A response that printed a settings group is stored under its tag.
  hooks.addAction("settings:group_changed", (changes, ctx) => {
    enqueuePurgeTags(ctx, [settingsTag(changes.group)]);
  });
}
