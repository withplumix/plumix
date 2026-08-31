// Naming the algorithm is what lets a better one ship later without silently
// reordering the results a site already has: a site that named the one it is
// on keeps that order. Retrofitting a name afterwards is what cannot be done.
export type RankingAlgorithm = "bm25-v1";

export const DEFAULT_RANKING_ALGORITHM: RankingAlgorithm = "bm25-v1";

/** Per-column bm25 multipliers, in the index's column order. */
export interface RankingWeights {
  readonly title: number;
  readonly body: number;
}

// A title is what an entry is about; a body is where the word happened to
// appear. Ten to one puts "Hydroponics, a guide" above an article mentioning
// hydroponics once, without burying a body match that is genuinely denser.
const WEIGHTS: Readonly<Record<RankingAlgorithm, RankingWeights>> = {
  "bm25-v1": { title: 10, body: 1 },
};

export function rankingWeights(algorithm: RankingAlgorithm): RankingWeights {
  return WEIGHTS[algorithm];
}
