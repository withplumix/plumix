import type { SearchSourceType } from "../db/schema.js";

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
