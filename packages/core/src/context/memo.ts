import { normalizeTag } from "../cdn/contract/tags.js";

/**
 * Request-scoped read-through memo — see `AppContextBase.memo`. Callers
 * namespace keys (`core:settings-group:site`, `menu:data:primary`) since
 * all consumers share one map per context.
 *
 * An entry may carry cache tags, in the vocabulary the CDN purges by. A write
 * announces itself through the lifecycle action it already fires, core's
 * roster turns that action into tags, and `enqueuePurgeTags` drops every entry
 * carrying one of them — before the action's caller continues, whether or not
 * the site has a CDN (#2517). So a request that hydrates an entry, publishes
 * it, and hydrates it again reads the published row, and a miss tagged by id
 * re-queries once the id becomes visible. Cron runs share one memo across
 * every task in the invocation, and the same drop is what keeps one task's
 * write visible to the next.
 *
 * An untagged entry is never dropped: a write in the same execution stays
 * invisible to it, which is what every entry was before tags existed. Tag
 * what a write can make stale; leave untagged what has no entity identity.
 *
 * Loaders must also be principal-invariant — `withUser` derivations share
 * the same memo, so anything user-dependent must embed the principal in the
 * key. A loader runs synchronously on a miss, which is what lets `memoBatch`
 * collect a whole walk's misses before loading them.
 */
export interface RequestMemo {
  <T>(
    key: string,
    load: () => Promise<T>,
    tags?: readonly string[],
  ): Promise<T>;
  /**
   * Drop every entry carrying any of `tags`, so its next read loads again.
   * Synchronous on purpose: `doAction` settles its handlers, so an async
   * invalidator that rejected would leave the memo stale behind nothing but a
   * logged hook failure.
   */
  invalidate(tags: readonly string[]): void;
}

export function createRequestMemo(): RequestMemo {
  const cache = new Map<string, Promise<unknown>>();
  const keysByTag = new Map<string, Set<string>>();
  const memo = <T>(
    key: string,
    load: () => Promise<T>,
    tags: readonly string[] = [],
  ): Promise<T> => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit as Promise<T>;
    const entry = load();
    cache.set(key, entry);
    for (const tag of tags) {
      const normalized = normalizeTag(tag);
      const keys = keysByTag.get(normalized) ?? new Set();
      keys.add(key);
      keysByTag.set(normalized, keys);
    }
    // Rejections are not memoized — a transient DB error on one read
    // shouldn't poison every later read of the same key in the request.
    // Only this load's own entry: a write may already have dropped it and a
    // later read put a fresh one in its place.
    entry.catch(() => {
      if (cache.get(key) === entry) cache.delete(key);
    });
    return entry;
  };
  return Object.assign(memo, {
    invalidate(tags: readonly string[]): void {
      for (const tag of tags) {
        const normalized = normalizeTag(tag);
        keysByTag.get(normalized)?.forEach((key) => cache.delete(key));
        keysByTag.delete(normalized);
      }
    },
  });
}

/**
 * Per-id memo over a batched load: each id resolves through `memo`, and
 * the ids that miss share one `loadAll` over exactly them — so a call runs
 * at most one batch, for what the request has not seen yet. Extra entries
 * in the map it returns are ignored; ids absent from that map memoize as
 * `null`.
 *
 * `tagsFor` names the cache tags each id's entry carries. It is handed the
 * id and never the payload, because a memoized miss has none and must still
 * drop when a write makes the id visible.
 */
export function memoBatch<K, T>(
  memo: RequestMemo,
  ids: readonly K[],
  keyFor: (id: K) => string,
  loadAll: (missing: readonly K[]) => Promise<ReadonlyMap<K, T>>,
  tagsFor?: (id: K) => readonly string[],
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
      memo(
        keyFor(id),
        async () => {
          missing.push(id);
          return (await load()).get(id) ?? null;
        },
        tagsFor?.(id),
      ),
    ),
  );
}
