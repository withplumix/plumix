/**
 * D1 caps bound parameters per statement, so a whole id set in one `IN (...)`
 * works on local SQLite and dies in production.
 */
export const D1_MAX_BOUND_PARAMETERS = 100;

/**
 * A caller binding other parameters alongside the ids should pass a lower
 * `limit`.
 */
export function chunkForD1<T>(
  items: readonly T[],
  limit: number = D1_MAX_BOUND_PARAMETERS,
): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += limit) {
    chunks.push(items.slice(i, i + limit));
  }
  return chunks;
}
