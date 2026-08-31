import type { AppContext } from "plumix/plugin";
import { inArray, sql } from "plumix/db";
import { entries } from "plumix/schema";

/**
 * How a page of results is ordered.
 *
 * `ranked` is bm25, and `recent` is newest first. Which one is right is a
 * question about the query, not a fallback: FTS5 scores every matching
 * document before applying a limit, so a word in nearly every document costs
 * time proportional to the corpus — and bm25 over such a word is noise
 * anyway, since it can hardly tell one document from another. Recency is the
 * better answer there, not a degraded one.
 */
export type SearchPlan = "ranked" | "recent";

/** How much of the corpus a word appears in before ranking it stops paying. */
export const DEFAULT_COMMON_TERM_THRESHOLD = 12_000;

/**
 * How far down the date order the recency plan is allowed to be asked to walk.
 *
 * This is the number that bounds the worst case. Recency reads `entries` in
 * published order and tests each against the index, so its cost is how many
 * entries it steps over before it has a page — not how many documents match.
 * Measured at 50 000 entries with a cap of 500: 0.43 ms to confirm a word in
 * every document, and 18 ms to reject one the walk never finds, against the
 * 761 ms that same query costs if the plan is chosen without asking.
 */
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
 * Which plan this query wants.
 *
 * Two questions, cheapest first, and both have to say yes before relevance
 * ordering is given up.
 *
 * **Is ranking expensive?** Counting the match set answers it, bounded by the
 * threshold it is compared against so it stops as soon as the answer is known.
 * Counting rather than reading a word's frequency out of the index's
 * vocabulary is deliberate: the vocabulary stores what the tokenizer produced,
 * and a word's term cannot be recovered from the word — "theory" is filed
 * under "theori", so the nearest thing a prefix search finds is "the", whose
 * frequency belongs to a different word. It is also exact where a per-word
 * frequency guesses, because the match set already accounts for the implicit
 * AND between words and the adjacency a phrase asks for.
 *
 * **Is recency cheap?** Nothing about the match set answers that, which is the
 * trap: a word in a quarter of the corpus is common by any count, and if every
 * one of those documents is old the recency walk still steps over everything
 * newer before it finds a page. So the walk itself is measured, capped — a
 * full page inside the cap is proof the reader will stop there too, and it is
 * the same question for a deep page, which simply needs more of them.
 */
export async function planForQuery(
  ctx: AppContext,
  { match, types, needed, threshold }: PlanArgs,
): Promise<SearchPlan> {
  // Deeper than the walk is allowed to go, so recency could never be shown to
  // be cheap — and asking would cost a capped walk to learn nothing.
  if (needed > HEAD_WALK_CAP) return "ranked";

  const [counted] = await ctx.db.all<{ matches: number }>(sql`
    SELECT count(*) AS matches FROM (
      SELECT 1 FROM search_index
       WHERE search_index MATCH ${match}
       LIMIT ${threshold + 1}
    )
  `);
  if ((counted?.matches ?? 0) <= threshold) return "ranked";

  const [reachable] = await ctx.db.all<{ found: number }>(sql`
    SELECT count(*) AS found FROM (
      SELECT 1 FROM (
        SELECT documents.id AS documentId
          FROM entries
          JOIN search_documents AS documents
            ON documents.source_type = 'entry'
           AND documents.source_id = entries.id
         WHERE entries.status = 'published'
           AND entries.published_at IS NOT NULL
           AND ${inArray(entries.type, types)}
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
