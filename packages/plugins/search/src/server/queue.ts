import type { AppContext, PluginSetupContext } from "plumix/plugin";
import type { Entry } from "plumix/schema";
import { eq } from "plumix/db";
import { ackEntryChanges, tryGetContext } from "plumix/plugin";
import { entryChanges } from "plumix/schema";

import { indexEntries } from "./index-writer.js";

/**
 * The entries this request has already handed to the deferred queue, held per
 * request so the same save cannot be indexed twice.
 *
 * Keyed on the request's memo rather than on the context itself, for the
 * reason core's cache-purge accumulator is: core derives contexts by
 * spreading — base-path stripping, `withUser`, the form-post session swap —
 * so an action that enqueued against a derived context would fill a set
 * nothing else reads. The memo is one object per request, carried by
 * reference through every derivation, and collected with it.
 */
const scheduled = new WeakMap<AppContext["memo"], Set<number>>();

// The lifecycle actions that can change what the index should say about an
// entry. `entry:meta_changed` is deliberately absent: meta is not indexed, so
// a metadata-only save has nothing to re-tokenize — the change feed's own
// guard says the same thing about a direct write.
// One entry saved over and over between drains leaves a row per save. The
// read is bounded so a hot entry cannot return an unbounded set; what is left
// over is drained like any other backlog.
const CHANGES_PER_ENTRY = 100;

const ENTRY_ACTIONS = [
  "entry:published",
  "entry:updated",
  "entry:trashed",
  "entry:restored",
  "entry:deleted",
] as const;

/**
 * Index this entry after the response, and clear the feed rows it left.
 *
 * One deferred call per entry rather than one per request. Core's purge
 * accumulator can batch because the dispatcher flushes it at a request-end
 * seam; a plugin has no such seam, and a promise handed to `defer` starts
 * running immediately — so a single flush scheduled by the first action
 * would read the set before the later ones had added to it, and silently
 * leave their entries to the next drain. Deduplication is what the set is
 * for here: publishing fires `entry:updated` and `entry:published`, and one
 * save is one document.
 *
 * A request that writes the same entry twice therefore indexes the first
 * state on this path and leaves the second to the drain — the feed still
 * holds it, so this costs freshness, not correctness.
 */
function enqueueEntryIndex(ctx: AppContext, entryId: number): void {
  let ids = scheduled.get(ctx.memo);
  if (ids === undefined) {
    ids = new Set();
    scheduled.set(ctx.memo, ids);
  }
  if (ids.has(entryId)) return;
  ids.add(entryId);
  ctx.defer(indexAndAck(ctx, entryId));
}

async function indexAndAck(ctx: AppContext, entryId: number): Promise<void> {
  // Read the feed rows before doing the work, not after: a change enqueued
  // while this runs is then left for the next drain rather than acknowledged
  // by a pass that never saw it. The trigger fires before this handler, so an
  // isolate that dies here leaves the row behind — at-least-once for free.
  const pending = await ctx.db
    .select({
      id: entryChanges.id,
      entryId: entryChanges.entryId,
      kind: entryChanges.kind,
    })
    .from(entryChanges)
    .where(eq(entryChanges.entryId, entryId))
    .limit(CHANGES_PER_ENTRY);
  // An empty feed is proof there is nothing to index: the trigger watches
  // title, content, excerpt, status, type, slug and parent_id, a strict
  // superset of what a document is built from. `entry:updated` fires on any
  // column write, a `sortOrder` save included, so without this the cheap
  // half of a bulk edit would still read every block tree and walk it.
  if (pending.length === 0) return;
  await indexEntries(ctx, [entryId]);
  await ackEntryChanges(ctx.db, pending);
}

/**
 * Subscribe the fast path to the entry lifecycle, so an entry saved through
 * the application is findable without waiting for a scheduled run.
 */
export function registerEntryIndexInvalidator(ctx: PluginSetupContext): void {
  const onEntry = (entry: Entry): void => {
    // A lifecycle action always fires inside a request; one fired outside has
    // no queue to defer through, and the feed catches it either way.
    const appCtx = tryGetContext();
    if (appCtx === null) return;
    enqueueEntryIndex(appCtx, entry.id);
  };
  for (const action of ENTRY_ACTIONS) ctx.addAction(action as never, onEntry);
}
