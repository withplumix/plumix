/**
 * Named so a better algorithm can ship later without silently reordering a
 * site that pinned this one.
 */
export type RankingAlgorithm = "bm25-v1";

export const DEFAULT_RANKING_ALGORITHM: RankingAlgorithm = "bm25-v1";

/** Per-column bm25 multipliers, in the index's column order. */
export interface RankingWeights {
  readonly title: number;
  readonly body: number;
}

// A title says what an entry is about; ten to one still lets a genuinely
// denser body match win.
const WEIGHTS: Readonly<Record<RankingAlgorithm, RankingWeights>> = {
  "bm25-v1": { title: 10, body: 1 },
};

export function rankingWeights(algorithm: RankingAlgorithm): RankingWeights {
  return WEIGHTS[algorithm];
}
