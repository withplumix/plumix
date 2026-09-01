import type { SearchSourceType } from "../db/schema.js";

/**
 * One row a reader produced, before it becomes a result: whatever names the
 * thing, plus what it takes to build its URL. Every reader answers in this
 * shape — the ranked one, the recency one and the one with no index to ask —
 * so the page around them is written once.
 */
export interface MatchedRow {
  readonly kind: SearchSourceType;
  readonly id: number;
  /** The entry's type, or the term's taxonomy — whichever names its URL. */
  readonly scope: string;
  readonly slug: string;
  readonly parentId: number | null;
  readonly title: string;
  readonly score: number | null;
  readonly snippet: string;
}
