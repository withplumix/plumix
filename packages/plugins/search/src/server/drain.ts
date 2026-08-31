import type { AppContext } from "plumix/plugin";
import { inArray, sql } from "plumix/db";
import { ackEntryChanges, readEntryChanges } from "plumix/plugin";
import { terms } from "plumix/schema";

import { ensureSearchIndex } from "../db/ddl.js";
import { searchableTaxonomies } from "./document.js";
import {
  currentExtractorVersion,
  indexEntries,
  indexTerms,
} from "./index-writer.js";
import { advanceReindex, SOURCES_PER_INVOCATION } from "./reindex.js";

// Matches the cap D1 puts on bound parameters, which is what the feed's own
// acknowledgement chunks at.
const CHANGES_PER_BATCH = 100;

// What one invocation is willing to do. A drain is bounded rather than run to
// completion so a backlog — a bulk import, a restored dump — is spread across
// invocations instead of running one of them past the platform's limits. The
// feed is durable, so what is left is simply drained next time.
const BATCHES_PER_RUN = 10;

/**
 * Bring the index up to date with whatever the change feed holds, and answer
 * with how many changes were handled.
 *
 * This is the safety net under the lifecycle fast path, and the only path at
 * all for a write that never reached the application: a seed, a migration, a
 * direct-write tool, a bulk import. The feed's triggers are on core's own
 * table, so none of them can bypass it.
 */
export async function drainEntryChanges(ctx: AppContext): Promise<number> {
  // The index is the half of the schema no drizzle migration can describe,
  // and so the half that can be missing. Repairing it before the drain turns
  // a migration that never ran into a delay rather than an outage; when
  // nothing is missing it costs one `sqlite_master` read.
  await ensureSearchIndex(ctx.db);

  let handled = 0;
  for (let batch = 0; batch < BATCHES_PER_RUN; batch += 1) {
    const changes = await readEntryChanges(ctx.db, CHANGES_PER_BATCH);
    if (changes.length === 0) break;
    // An entry saved several times between drains appears once per save;
    // `indexEntries` collapses the batch, so the work is per entry.
    await indexEntries(
      ctx,
      changes.map((change) => change.entryId),
    );
    await ackEntryChanges(ctx.db, changes);
    handled += changes.length;
  }
  return handled;
}

// Bounded the way the drain is, and for the same reason: a site installing the
// plugin with thousands of terms already in place should converge over a few
// invocations rather than do it all inside one.
const TERMS_PER_RUN = 100;

/**
 * Index terms the projection has never held, and answer with how many.
 *
 * Terms have no change feed — core's records entries — so the lifecycle
 * actions are the only thing that indexes one, and they only ever fire for a
 * term somebody touches. Without this, installing the plugin on a site that
 * already has categories would leave every one of them unfindable until it
 * was next edited.
 *
 * Only searchable taxonomies are considered, so a term that is never going to
 * be projected is not selected again on every run. What remains converges to
 * nothing, which is why this can be unconditional rather than a job somebody
 * starts.
 */
export async function backfillTerms(ctx: AppContext): Promise<number> {
  const taxonomies = searchableTaxonomies(ctx.plugins);
  if (taxonomies.length === 0) return 0;

  const missing = await ctx.db.all<{ id: number }>(sql`
    SELECT terms.id AS id
      FROM terms
     WHERE ${inArray(terms.taxonomy, taxonomies)}
       AND NOT EXISTS (
         SELECT 1 FROM search_documents
          WHERE search_documents.source_type = 'term'
            AND search_documents.source_id = terms.id
       )
     LIMIT ${TERMS_PER_RUN}
  `);
  if (missing.length === 0) return 0;
  await indexTerms(
    ctx,
    missing.map((row) => row.id),
  );
  return missing.length;
}

/**
 * Re-project the entries an older extractor left behind, and answer with how
 * many. Bounded, and self-draining: a document this rewrites carries the
 * current version afterwards, so it is not a candidate again.
 *
 * Only entries. The extractor version is a hash of the block roster, and a
 * term has no blocks — its documents carry a version of their own that the
 * roster cannot move.
 */
export async function repairStaleEntries(
  ctx: AppContext,
  version: string,
  limit: number,
): Promise<number> {
  const stale = await ctx.db.all<{ id: number }>(sql`
    SELECT source_id AS id FROM search_documents
     WHERE source_type = 'entry' AND extractor_version <> ${version}
     LIMIT ${limit}
  `);
  if (stale.length === 0) return 0;
  await indexEntries(
    ctx,
    stale.map((row) => row.id),
  );
  return stale.length;
}

const say = (ctx: AppContext, line: string): void => {
  ctx.logger.info(`[plumix/plugin-search] ${line}`);
};

const count = (n: number, noun: string): string =>
  `${String(n)} ${noun}${n === 1 ? "" : "s"}`;

/**
 * Everything the scheduled trigger owes the index, in the order it owes it.
 *
 * Draining comes first because it repairs the index itself when a migration
 * has not reached it, and the three sweeps behind it all write through the
 * same triggers. Each is bounded and converges: a site with nothing outstanding
 * pays four cheap reads and says nothing.
 */
export async function runSearchMaintenance(ctx: AppContext): Promise<void> {
  const drained = await drainEntryChanges(ctx);
  if (drained > 0) {
    say(ctx, `indexed ${count(drained, "change")} from the entry feed`);
  }

  const rebuilt = await advanceReindex(ctx);
  if (rebuilt > 0) say(ctx, `rebuilt ${count(rebuilt, "source")}`);

  const repaired = await repairStaleEntries(
    ctx,
    currentExtractorVersion(ctx),
    SOURCES_PER_INVOCATION,
  );
  if (repaired > 0) {
    say(
      ctx,
      `re-extracted ${count(repaired, "document")} an older block roster had produced`,
    );
  }

  const backfilled = await backfillTerms(ctx);
  if (backfilled > 0) {
    say(
      ctx,
      `indexed ${count(backfilled, "term")} the projection had never held`,
    );
  }
}
