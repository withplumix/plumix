/** Cloudflare D1 caps a prepared statement at this many bound parameters —
 *  `inArray`/`IN (...)` binds one per id, so a whole id set in one statement
 *  works on local SQLite and dies in production. #2312, #2299 */
export const D1_MAX_BOUND_PARAMETERS = 100;

/** Splits `items` into chunks of at most `limit` (default the D1 cap), so an
 *  id list can be bound one chunk per statement instead of all at once. A
 *  caller binding other parameters alongside the ids should pass a lower
 *  `limit`, leaving room for them under the cap. */
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
