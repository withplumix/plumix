import type { AppContext } from "../context/app-context.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { CacheRead, CacheWrite } from "./contract/subjects.js";
import { readTags, writeTags } from "../plugin/cache-tags.js";
import { declarePageTags } from "./contract/page-tags.js";
import { enqueuePurgeTags } from "./purge.js";

// Where a request records what it read and what it wrote (ADR 0042), and the
// lifecycle hooks through which core's own writes do. The tags come from the
// one rule in `plugin/cache-tags.ts`.

/**
 * Say what this request's response read, so it is stored under the tags a
 * write to any of it purges. Reaches whatever response the request produces:
 * a public page's, beside its route's own reads, and a `cacheable: true`
 * plugin route's. Calling it more than once unions the reads; calling it on a
 * response that never reaches the CDN does nothing.
 */
export function recordRead(
  ctx: Pick<AppContext, "memo" | "plugins">,
  reads: readonly CacheRead[],
): void {
  declarePageTags(ctx, readTags(ctx.plugins, reads));
}

/**
 * Say what a write changed. The request memo drops every entry that read it
 * straight away, and the CDN purges every stored response that read it once
 * the request ends. Core's own writes announce themselves through their
 * lifecycle hooks; a plugin calls this for a write core cannot see.
 */
export function recordWrite(
  ctx: AppContext,
  writes: readonly CacheWrite[],
): void {
  enqueuePurgeTags(ctx, writeTags(ctx.plugins, writes));
}

/**
 * Register what core's lifecycle hooks changed. Registered at every boot, CDN
 * or not: the request memo needs it everywhere, and without a CDN the purge
 * half accumulates nothing. Every handler is synchronous for the memo's sake;
 * see `RequestMemo.invalidate`.
 */
export function registerCoreInvalidation(hooks: HookRegistry): void {
  const onEntry = (
    entry: { readonly id: number; readonly type: string },
    ctx: AppContext,
  ): void => {
    recordWrite(ctx, [{ kind: "entry", id: entry.id, type: entry.type }]);
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

  const onUser = (user: { readonly id: number }, ctx: AppContext): void => {
    recordWrite(ctx, [{ kind: "user", id: user.id }]);
  };
  hooks.addAction("user:updated", (user, _previous, ctx) => onUser(user, ctx));
  hooks.addAction("user:meta_changed", (user, _changes, ctx) =>
    onUser(user, ctx),
  );
  hooks.addAction("user:deleted", (user, _deletion, ctx) => onUser(user, ctx));

  const onTerm = (
    term: { readonly id: number; readonly taxonomy: string },
    ctx: AppContext,
  ): void => {
    recordWrite(ctx, [{ kind: "term", id: term.id, taxonomy: term.taxonomy }]);
  };
  hooks.addAction("term:created", onTerm);
  hooks.addAction("term:deleted", onTerm);
  hooks.addAction("term:updated", (term, _previous, ctx) => onTerm(term, ctx));
  hooks.addAction("term:meta_changed", (term, _changes, ctx) =>
    onTerm(term, ctx),
  );

  hooks.addAction("settings:group_changed", (changes, ctx) => {
    recordWrite(ctx, [{ kind: "settings", group: changes.group }]);
  });
}
