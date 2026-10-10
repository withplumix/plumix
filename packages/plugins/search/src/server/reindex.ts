import type { AppContext } from "plumix/plugin";
import { and, asc, desc, eq, gt, inArray, sql } from "plumix/db";
import { entries, entryChanges, terms } from "plumix/schema";

import type { SearchReindexRun, SearchSourceType } from "../db/schema.js";
import { searchReindexRuns } from "../db/schema.js";
import { SearchError } from "../errors.js";
import { indexableEntryTypes, searchableTaxonomies } from "./document.js";
import { indexEntries, indexTerms } from "./index-writer.js";

/**
 * Well under a second of work: backfill was measured at roughly 1 300 sources a
 * second.
 */
export const SOURCES_PER_INVOCATION = 200;

/** Entries first: they are the bulk, so progress means something early. */
const KIND_ORDER: readonly SearchSourceType[] = ["entry", "term"];

function kindAfter(kind: SearchSourceType): SearchSourceType | undefined {
  return KIND_ORDER[KIND_ORDER.indexOf(kind) + 1];
}

/** The most recent run, finished or not — what an operator reads. */
export async function latestReindex(
  ctx: AppContext,
): Promise<SearchReindexRun | null> {
  const [run] = await ctx.db
    .select()
    .from(searchReindexRuns)
    .orderBy(desc(searchReindexRuns.id))
    .limit(1);
  return run ?? null;
}

async function activeReindex(
  ctx: AppContext,
): Promise<SearchReindexRun | null> {
  const run = await latestReindex(ctx);
  return run?.status === "running" ? run : null;
}

/**
 * Returns the active run if there is one; a second concurrent walk would undo
 * its progress.
 */
export async function startReindex(ctx: AppContext): Promise<SearchReindexRun> {
  const active = await activeReindex(ctx);
  if (active !== null) return active;
  const [run] = await ctx.db
    .insert(searchReindexRuns)
    .values({ status: "running", cursorType: "entry", cursorId: 0 })
    .returning();
  if (run === undefined) throw SearchError.reindexInsertReturnedNoRow();
  return run;
}

/**
 * Re-projects in place, never emptying the index, so search keeps answering.
 * A source that cannot be projected is counted, not thrown.
 */
export async function advanceReindex(
  ctx: AppContext,
  chunk = SOURCES_PER_INVOCATION,
): Promise<number> {
  const run = await activeReindex(ctx);
  if (run === null) return 0;
  try {
    return await walk(ctx, run, chunk);
  } catch (error) {
    // Must end: a run stuck at `running` would block every restart, since
    // starting is idempotent.
    ctx.logger.error("[plumix/plugin-search] reindex failed", { error });
    await ctx.db
      .update(searchReindexRuns)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(searchReindexRuns.id, run.id));
    return 0;
  }
}

async function walk(
  ctx: AppContext,
  run: SearchReindexRun,
  chunk: number,
): Promise<number> {
  let { cursorType, cursorId } = run;
  let processed = 0;
  let failed = 0;
  let remaining = chunk;
  let completed = false;

  while (remaining > 0) {
    const ids = await nextSources(ctx, cursorType, cursorId, remaining);
    const last = ids.at(-1);
    if (last === undefined) {
      const next = kindAfter(cursorType);
      if (next === undefined) {
        completed = true;
        break;
      }
      cursorType = next;
      cursorId = 0;
      continue;
    }
    const outcome = await projectBatch(ctx, cursorType, ids);
    processed += outcome.processed;
    failed += outcome.failed;
    cursorId = last;
    remaining -= ids.length;
  }

  const total = run.failed + failed;
  await ctx.db
    .update(searchReindexRuns)
    .set({
      cursorType,
      cursorId,
      // Added in SQL so overlapping invocations do not overwrite each other's
      // progress.
      processed: sql`${searchReindexRuns.processed} + ${processed}`,
      failed: sql`${searchReindexRuns.failed} + ${failed}`,
      ...(completed && {
        status: total > 0 ? "completed_with_errors" : "succeeded",
        finishedAt: new Date(),
      }),
    })
    .where(eq(searchReindexRuns.id, run.id));
  return processed;
}

/**
 * A failed batch is retried per source, so one bad row does not take healthy
 * ones with it past the cursor.
 */
async function projectBatch(
  ctx: AppContext,
  kind: SearchSourceType,
  ids: readonly number[],
): Promise<{ processed: number; failed: number }> {
  try {
    await project(ctx, kind, ids);
    return { processed: ids.length, failed: 0 };
  } catch {
    let processed = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await project(ctx, kind, [id]);
        processed += 1;
      } catch (error) {
        failed += 1;
        ctx.logger.error(
          `[plumix/plugin-search] reindex could not project ${kind} ${String(id)}`,
          { error },
        );
      }
    }
    return { processed, failed };
  }
}

async function nextSources(
  ctx: AppContext,
  kind: SearchSourceType,
  after: number,
  limit: number,
): Promise<readonly number[]> {
  if (kind === "entry") {
    const types = indexableEntryTypes(ctx.plugins);
    if (types.length === 0) return [];
    const rows = await ctx.db
      .select({ id: entries.id })
      .from(entries)
      .where(and(gt(entries.id, after), inArray(entries.type, types)))
      .orderBy(asc(entries.id))
      .limit(limit);
    // Skip entries the feed still owes: projecting them would race the drain
    // and could write older text over newer.
    return await withoutPendingChanges(
      ctx,
      rows.map((row) => row.id),
    );
  }
  const taxonomies = searchableTaxonomies(ctx.plugins);
  if (taxonomies.length === 0) return [];
  const rows = await ctx.db
    .select({ id: terms.id })
    .from(terms)
    .where(and(gt(terms.id, after), inArray(terms.taxonomy, taxonomies)))
    .orderBy(asc(terms.id))
    .limit(limit);
  return rows.map((row) => row.id);
}

async function withoutPendingChanges(
  ctx: AppContext,
  ids: readonly number[],
): Promise<readonly number[]> {
  if (ids.length === 0) return ids;
  const owed = await ctx.db
    .select({ entryId: entryChanges.entryId })
    .from(entryChanges)
    .where(inArray(entryChanges.entryId, ids));
  if (owed.length === 0) return ids;
  const pending = new Set(owed.map((row) => row.entryId));
  return ids.filter((id) => !pending.has(id));
}

function project(
  ctx: AppContext,
  kind: SearchSourceType,
  ids: readonly number[],
): Promise<void> {
  return kind === "entry" ? indexEntries(ctx, ids) : indexTerms(ctx, ids);
}
