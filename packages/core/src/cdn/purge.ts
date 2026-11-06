import type { AppContext } from "../context/app-context.js";
import type { RequestMemo } from "../context/memo.js";
import type { HookRegistry } from "../hooks/registry.js";
import { entry } from "../hooks/entry.js";
import { settings } from "../hooks/settings.js";
import { term } from "../hooks/term.js";
import { userEvents } from "../hooks/user.js";
import {
  entryPurgeTags,
  normalizeTag,
  settingsTag,
  taxonomyListTag,
  termSlugsTag,
  termTag,
  userSlugsTag,
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
  ctx: Pick<AppContext, "cdn" | "memo">,
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
  // Entry events that change what the public sees — published, edited,
  // meta-changed, or removed from view (trash/delete) / restored. Every
  // payload's `entry` carries `{ id, type }`.
  const onEntry = (
    {
      entry: row,
    }: { readonly entry: { readonly id: number; readonly type: string } },
    ctx: AppContext,
  ): void => {
    enqueuePurgeTags(ctx, entryPurgeTags(row.type, row.id));
  };
  hooks.on(entry.published, onEntry);
  hooks.on(entry.trashed, onEntry);
  hooks.on(entry.restored, onEntry);
  hooks.on(entry.deleted, onEntry);
  hooks.on(entry.updated, onEntry);
  hooks.on(entry.metaChanged, onEntry);

  // Only the pages that rendered the user. The slug lookup has no id to be
  // tagged by, so any user write drops it from the memo.
  const onUser = (user: { readonly id: number }, ctx: AppContext): void => {
    enqueuePurgeTags(ctx, [userTag(user.id)]);
    ctx.memo.invalidate([userSlugsTag()]);
  };
  hooks.on(userEvents.updated, ({ user }, ctx) => onUser(user, ctx));
  hooks.on(userEvents.metaChanged, ({ user }, ctx) => onUser(user, ctx));
  // The deleted user's entries now render the user they went to, whose pages
  // never heard an entry event for them.
  hooks.on(userEvents.deleted, ({ user, reassignedTo }, ctx) => {
    onUser(user, ctx);
    if (reassignedTo !== null) onUser({ id: reassignedTo }, ctx);
  });

  // A new or deleted term changes every list of its taxonomy's terms, as well
  // as the pages that rendered it.
  const onTerm = (
    {
      term: row,
    }: { readonly term: { readonly id: number; readonly taxonomy: string } },
    ctx: AppContext,
  ): void => {
    enqueuePurgeTags(ctx, [termTag(row.id), taxonomyListTag(row.taxonomy)]);
    ctx.memo.invalidate([termSlugsTag()]);
  };
  hooks.on(term.created, onTerm);
  hooks.on(term.deleted, onTerm);
  const onTermEdit = (
    { term: row }: { readonly term: { readonly id: number } },
    ctx: AppContext,
  ): void => {
    enqueuePurgeTags(ctx, [termTag(row.id)]);
    ctx.memo.invalidate([termSlugsTag()]);
  };
  hooks.on(term.updated, onTermEdit);
  hooks.on(term.metaChanged, onTermEdit);

  // A response that printed a settings group is stored under its tag.
  hooks.on(settings.groupChanged, ({ group }, ctx) => {
    enqueuePurgeTags(ctx, [settingsTag(group)]);
  });
}
