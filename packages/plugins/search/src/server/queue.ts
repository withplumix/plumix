import type { AppContext, PluginSetupContext } from "plumix/plugin";
import type { Term } from "plumix/schema";
import { eq } from "plumix/db";
import { ackEntryChanges, entry, term } from "plumix/plugin";
import { entryChanges } from "plumix/schema";

import { indexEntries, indexTerms } from "./index-writer.js";

/**
 * Keyed on the memo, not the context: core derives contexts by spreading, but
 * the memo is one object per request shared by every derivation.
 */
const scheduled = new WeakMap<AppContext["memo"], Set<number>>();

/**
 * Bounded so a hot entry cannot return an unbounded set; the rest drains
 * like any backlog.
 */
const CHANGES_PER_ENTRY = 100;

/**
 * One deferral per entry, not per request: `defer` starts at once and plugins
 * have no request-end seam. A second write of an entry is left to the drain.
 */
function enqueueEntryIndex(ctx: AppContext, entryId: number): void {
  if (!claim(ctx, entryId)) return;
  ctx.defer(indexAndAck(ctx, entryId));
}

/**
 * Not deduplicated: no feed holds terms, so a dropped write would be lost
 * until the next edit.
 */
function enqueueTermIndex(ctx: AppContext, termId: number): void {
  ctx.defer(indexTerms(ctx, [termId]));
}

function claim(ctx: AppContext, entryId: number): boolean {
  let ids = scheduled.get(ctx.memo);
  if (ids === undefined) {
    ids = new Set();
    scheduled.set(ctx.memo, ids);
  }
  if (ids.has(entryId)) return false;
  ids.add(entryId);
  return true;
}

async function indexAndAck(ctx: AppContext, entryId: number): Promise<void> {
  // Read before indexing, so a change enqueued meanwhile is not acknowledged
  // by a pass that never saw it.
  const pending = await ctx.db
    .select({
      id: entryChanges.id,
      entryId: entryChanges.entryId,
      kind: entryChanges.kind,
    })
    .from(entryChanges)
    .where(eq(entryChanges.entryId, entryId))
    .limit(CHANGES_PER_ENTRY);
  // The feed trigger watches a superset of the document's inputs, so an empty
  // feed skips work for writes like a `sortOrder` save.
  if (pending.length === 0) return;
  await indexEntries(ctx, [entryId]);
  await ackEntryChanges(ctx.db, pending);
}

export function registerIndexInvalidator(ctx: PluginSetupContext): void {
  // `entry.metaChanged` counts because meta fields can be searchable. It fires
  // before `entry.updated`, so a later `entry.updated` mutation waits for the
  // drain.
  const onEntry = (
    { entry: row }: { readonly entry: { readonly id: number } },
    appCtx: AppContext,
  ): void => {
    enqueueEntryIndex(appCtx, row.id);
  };
  ctx.events.on(entry.published, onEntry);
  ctx.events.on(entry.trashed, onEntry);
  ctx.events.on(entry.restored, onEntry);
  ctx.events.on(entry.deleted, onEntry);
  ctx.events.on(entry.updated, onEntry);
  ctx.events.on(entry.metaChanged, onEntry);

  // No `term.metaChanged`: term meta is never indexed.
  const onTerm = (
    { term: row }: { readonly term: Term },
    appCtx: AppContext,
  ): void => {
    enqueueTermIndex(appCtx, row.id);
  };
  ctx.events.on(term.created, onTerm);
  ctx.events.on(term.deleted, onTerm);
  ctx.events.on(term.updated, onTerm);
}
