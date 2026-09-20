/**
 * Request-scoped read-through memo — see `AppContextBase.memo`. Callers
 * namespace keys (`core:settings-group:site`, `menu:data:primary`) since
 * all consumers share one map per context.
 *
 * There is no invalidation: a write in the same execution is invisible to
 * keys already loaded (cron runs share one memo across every task in the
 * invocation). Loaders must also be principal-invariant — `withUser`
 * derivations share the same memo, so anything user-dependent must embed
 * the principal in the key. A loader runs synchronously on a miss, which is
 * what lets `memoBatch` collect a whole walk's misses before loading them.
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
 * the ids that miss share one `loadAll` over exactly them — so a call runs
 * at most one batch, for what the request has not seen yet. Extra entries
 * in the map it returns are ignored; ids absent from that map memoize as
 * `null`.
 */
export function memoBatch<K, T>(
  memo: RequestMemo,
  ids: readonly K[],
  keyFor: (id: K) => string,
  loadAll: (missing: readonly K[]) => Promise<ReadonlyMap<K, T>>,
): Promise<(T | null)[]> {
  const missing: K[] = [];
  let batch: Promise<ReadonlyMap<K, T>> | undefined;
  // Deferred a microtask: `memo` runs the loader synchronously on a miss,
  // so the whole walk below registers its misses before `loadAll` is given
  // them.
  const load = () =>
    (batch ??= Promise.resolve().then(() => loadAll([...missing])));
  return Promise.all(
    ids.map((id) =>
      memo(keyFor(id), async () => {
        missing.push(id);
        return (await load()).get(id) ?? null;
      }),
    ),
  );
}
