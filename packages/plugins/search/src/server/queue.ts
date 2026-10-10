import type { AppContext, PluginSetupContext } from "plumix/plugin";
import type { Term } from "plumix/schema";
import { eq } from "plumix/db";
import { ackEntryChanges } from "plumix/plugin";
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
  // `entry:meta_changed` counts because meta fields can be searchable. It fires
  // before `entry:updated`, so a later `entry:updated` mutation waits for the
  // drain.
  const onEntry = (
    entry: { readonly id: number },
    appCtx: AppContext,
  ): void => {
    enqueueEntryIndex(appCtx, entry.id);
  };
  ctx.addAction("entry:published", onEntry);
  ctx.addAction("entry:trashed", onEntry);
  ctx.addAction("entry:restored", onEntry);
  ctx.addAction("entry:deleted", onEntry);
  ctx.addAction("entry:updated", (entry, _previous, appCtx) =>
    onEntry(entry, appCtx),
  );
  ctx.addAction("entry:meta_changed", (entry, _changes, appCtx) =>
    onEntry(entry, appCtx),
  );

  // No `term:meta_changed`: term meta is never indexed.
  const onTerm = (term: Term, appCtx: AppContext): void => {
    enqueueTermIndex(appCtx, term.id);
  };
  ctx.addAction("term:created", onTerm);
  ctx.addAction("term:deleted", onTerm);
  ctx.addAction("term:updated", (term, _previous, appCtx) =>
    onTerm(term, appCtx),
  );
}
