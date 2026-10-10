import type { AppContext } from "plumix/plugin";
import { sql } from "plumix/db";

import { searchableEntryRows } from "./query-scope.js";

/**
 * `recent` is not a fallback: FTS5 scores every match before the limit, and
 * bm25 over a near-universal word is noise anyway.
 */
export type SearchPlan = "ranked" | "recent";

/** How much of the corpus a word appears in before ranking it stops paying. */
export const DEFAULT_COMMON_TERM_THRESHOLD = 12_000;

// Bounds the recency plan's worst case. Measured at 50 000 entries: 0.43 ms to
// confirm, 18 ms to reject, versus 761 ms choosing without asking.
const HEAD_WALK_CAP = 500;

export interface PlanArgs {
  /** The compiled FTS5 match expression, not the query as typed. */
  readonly match: string;
  /** The entry types a result may come from — the reader's own clamp. */
  readonly types: readonly string[];
  /** Results the reader has to produce, offset included. */
  readonly needed: number;
  readonly threshold: number;
}

/**
 * `recent` only when ranking is expensive and a capped walk proves recency
 * cheap. Counts matches rather than reading vocabulary, since stemmed terms
 * cannot be recovered from words.
 */
export async function planForQuery(
  ctx: AppContext,
  { match, types, needed, threshold }: PlanArgs,
): Promise<SearchPlan> {
  // Recency could never be shown cheap this deep.
  if (needed > HEAD_WALK_CAP) return "ranked";

  const [counted] = await ctx.db.all<{ matches: number }>(sql`
    SELECT count(*) AS matches FROM (
      SELECT 1 FROM search_index
       WHERE search_index MATCH ${match}
       LIMIT ${threshold + 1}
    )
  `);
  if ((counted?.matches ?? 0) <= threshold) return "ranked";

  // No entry to walk, so recency has nothing to be cheap at.
  const entryRows = searchableEntryRows(ctx, types);
  if (entryRows === null) return "ranked";

  const [reachable] = await ctx.db.all<{ found: number }>(sql`
    SELECT count(*) AS found FROM (
      SELECT 1 FROM (
        SELECT documents.id AS documentId
          FROM entries
          JOIN search_documents AS documents
            ON documents.source_type = 'entry'
           AND documents.source_id = entries.id
         WHERE ${entryRows}
         ORDER BY entries.published_at DESC, entries.id DESC
         LIMIT ${HEAD_WALK_CAP}
      ) AS head
      WHERE EXISTS (
        SELECT 1 FROM search_index
         WHERE search_index MATCH ${match} AND rowid = head.documentId
      )
      LIMIT ${needed}
    )
  `);
  return (reachable?.found ?? 0) >= needed ? "recent" : "ranked";
}
