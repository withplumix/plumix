import type { AppContext } from "plumix/plugin";
import { and, asc, desc, eq, gt, inArray, sql } from "plumix/db";
import { entries, entryChanges, terms } from "plumix/schema";

import type { SearchReindexRun, SearchSourceType } from "../db/schema.js";
import { searchReindexRuns } from "../db/schema.js";
import { SearchError } from "../errors.js";
import { searchableEntryTypes, searchableTaxonomies } from "./document.js";
import { indexEntries, indexTerms } from "./index-writer.js";

/**
 * How much of the corpus one invocation rebuilds. Backfill was measured at
 * roughly 1 300 sources a second, so this is well under a second of work and
 * leaves the invocation to whatever else it was scheduled for.
 */
export const SOURCES_PER_INVOCATION = 200;

// The order the kinds are walked in. Entries first because they are the bulk
// of any corpus, so a run's progress number means something early.
const KIND_ORDER: readonly SearchSourceType[] = ["entry", "term"];

/** The kind taken up once this one is exhausted, or nothing when done. */
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
 * Begin a rebuild, or answer with the one already going.
 *
 * Starting is deliberately idempotent rather than an error: an operator who
 * presses the button twice, and a schedule that fires while a rebuild is under
 * way, both mean "make sure this is happening" — and a second concurrent walk
 * over the same corpus would only undo the first one's progress.
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
 * Do one invocation's worth of the active run, and answer with how many
 * sources it got through. Zero when there is no run.
 *
 * The index is never emptied first: each source is re-projected in place, so
 * every document the walk has not reached yet is the one it always was and
 * search keeps answering throughout. That is the whole reason a rebuild is a
 * walk rather than a truncate-and-fill.
 *
 * A source that cannot be projected is counted rather than thrown, so one bad
 * row cannot stop the rest of the corpus — the run says
 * `completed_with_errors` at the end, which is a different thing to tell an
 * operator than `failed`.
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
    // A run that threw has to end, not stay running: starting is idempotent,
    // so a run stuck at `running` would refuse every replacement an operator
    // asked for. `failed` is the answer that lets them start again.
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
      // Added in SQL rather than in JavaScript: the row is the whole
      // durability story, and two invocations that overlapped would otherwise
      // each write the other's progress away.
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
 * Project a batch, and answer with how much of it landed.
 *
 * A batch that throws is retried one source at a time rather than written off
 * whole: the projection sub-chunks internally, so a single bad row would
 * otherwise take up to two hundred healthy ones with it — counted as failed,
 * stepped over by the cursor, and never looked at again. Isolating costs one
 * statement per source, and only on the batches that actually failed.
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

/** The next ids of this kind after the cursor, in the order the walk takes. */
async function nextSources(
  ctx: AppContext,
  kind: SearchSourceType,
  after: number,
  limit: number,
): Promise<readonly number[]> {
  if (kind === "entry") {
    const types = searchableEntryTypes(ctx.plugins);
    if (types.length === 0) return [];
    const rows = await ctx.db
      .select({ id: entries.id })
      .from(entries)
      .where(and(gt(entries.id, after), inArray(entries.type, types)))
      .orderBy(asc(entries.id))
      .limit(limit);
    // An entry the feed still owes is one somebody has written since this walk
    // started reading. Projecting it here would race the drain and could put
    // the older text back — the walk reads, the editor saves, the drain writes
    // the new text and clears the row, and then the walk's write lands on top
    // with what it read. Whatever the feed holds is the fresher answer, so the
    // walk steps over it and lets the drain have it.
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
