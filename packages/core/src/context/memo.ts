/**
 * Request-scoped read-through memo — see `AppContextBase.memo`. Callers
 * namespace keys (`core:settings-group:site`, `menu:data:primary`) since
 * all consumers share one map per context.
 *
 * There is no invalidation: a write in the same execution is invisible to
 * keys already loaded (cron runs share one memo across every task in the
 * invocation). Loaders must also be principal-invariant — `withUser`
 * derivations share the same memo, so anything user-dependent must embed
 * the principal in the key.
 */
export type RequestMemo = <T>(
  key: string,
  load: () => Promise<T>,
) => Promise<T>;

export function createRequestMemo(): RequestMemo {
  const cache = new Map<string, Promise<unknown>>();
  return <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit as Promise<T>;
    const entry = load();
    cache.set(key, entry);
    // Rejections are not memoized — a transient DB error on one read
    // shouldn't poison every later read of the same key in the request.
    entry.catch(() => cache.delete(key));
    return entry;
  };
}

/**
 * Per-id memo over a batched load: each id resolves through `memo`, and
 * all misses share one lazy `loadAll` (single-flight, so the batch runs
 * at most once per call). `loadAll` may fetch every requested id — hits
 * keep their first-seen value regardless. Ids absent from the loaded map
 * memoize as `null`.
 */
export function memoBatch<K, T>(
  memo: RequestMemo,
  ids: readonly K[],
  keyFor: (id: K) => string,
  loadAll: () => Promise<ReadonlyMap<K, T>>,
): Promise<(T | null)[]> {
  let batch: Promise<ReadonlyMap<K, T>> | undefined;
  const load = () => (batch ??= loadAll());
  return Promise.all(
    ids.map((id) =>
      memo(keyFor(id), async () => (await load()).get(id) ?? null),
    ),
  );
}
