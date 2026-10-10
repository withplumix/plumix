import { normalizeTag } from "../cdn/contract/tags.js";

/**
 * Keys are namespaced (`core:settings-group:site`), and anything user-dependent
 * embeds the principal, since `withUser` derivations share one map. Tag what a
 * write can make stale.
 */
export interface RequestMemo {
  <T>(
    key: string,
    load: () => Promise<T>,
    tags?: readonly string[],
  ): Promise<T>;
  /**
   * Synchronous on purpose: `doAction` settles its handlers, so a rejected
   * async invalidator would leave the memo stale behind only a logged failure.
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
    // A transient error must not poison later reads. Check identity: a write
    // may have replaced this entry with a fresh one.
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
 * Ids absent from `loadAll`'s map memoize as `null`. `tagsFor` gets the id,
 * never the payload, so a memoized miss still drops when the id appears.
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
