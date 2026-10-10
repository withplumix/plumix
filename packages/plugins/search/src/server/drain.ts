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

// Bounded so a backlog spreads across invocations instead of breaching platform
// limits; the feed is durable, so the rest drains next time.
const BATCHES_PER_RUN = 10;

/**
 * The only path for writes that bypass the application (seeds, migrations, bulk
 * imports).
 */
export async function drainEntryChanges(ctx: AppContext): Promise<number> {
  // Turns a migration that never ran into a delay rather than an outage, for
  // one `sqlite_master` read when nothing is missing.
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

/**
 * Bounded like the drain, so a site installing with thousands of terms
 * converges over several invocations.
 */
export const TERMS_PER_RUN = 100;

/**
 * Terms have no change feed, so without this pre-existing or directly written
 * terms stay unfindable or stale until edited. Converges, so it runs
 * unconditionally.
 */
export async function backfillTerms(ctx: AppContext): Promise<number> {
  const taxonomies = searchableTaxonomies(ctx.plugins);
  if (taxonomies.length === 0) return 0;

  // The comparison mirrors what `indexTerms` writes, so a term it has just
  // re-projected matches again and drops out of the next run.
  const outdated = await ctx.db.all<{ id: number }>(sql`
    SELECT terms.id AS id
      FROM terms
      LEFT JOIN search_documents AS documents
        ON documents.source_type = 'term'
       AND documents.source_id = terms.id
     WHERE ${inArray(terms.taxonomy, taxonomies)}
       AND (
         documents.id IS NULL
         OR documents.title IS NOT terms.name
         OR documents.body IS NOT COALESCE(terms.description, '')
       )
     LIMIT ${TERMS_PER_RUN}
  `);
  if (outdated.length === 0) return 0;
  await indexTerms(
    ctx,
    outdated.map((row) => row.id),
  );
  return outdated.length;
}

/**
 * Entries only: the extractor version hashes block and meta rosters, which
 * terms lack.
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
 * Drains first because that repairs a missing index the later sweeps write
 * through.
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
      `re-extracted ${count(repaired, "document")} an older declaration had produced`,
    );
  }

  const backfilled = await backfillTerms(ctx);
  if (backfilled > 0) {
    say(
      ctx,
      `indexed ${count(backfilled, "term")} the projection was missing or out of date on`,
    );
  }
}
