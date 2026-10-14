const RECENT_KEY = "plumix.v2.palette.recent";
const MAX_STORED = 8;

type RecentNavStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Reads `localStorage` only when called, so a browser that blocks storage
 * throws inside the callers' `try` rather than at a default parameter.
 */
const browserStorage: RecentNavStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

/** Push a destination to the front of the recently-visited list
 *  (deduped, capped). Silent on failure — recents are a convenience,
 *  not worth surfacing a quota/private-mode error per navigation. */
export function recordRecentNav(
  to: string,
  storage: RecentNavStorage = browserStorage,
): void {
  try {
    const next = [to, ...readRecentNav(storage).filter((t) => t !== to)].slice(
      0,
      MAX_STORED,
    );
    storage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* empty */
  }
}

export function readRecentNav(
  storage: RecentNavStorage = browserStorage,
): readonly string[] {
  try {
    const raw = storage.getItem(RECENT_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** Recents absent from `navItems` (uninstalled plugin, lost capability)
 *  drop out, so capability filtering and dead-route pruning come for free
 *  from the already-filtered nav list. */
export function selectRecentNavItems<T extends { readonly to: string }>(
  navItems: readonly T[],
  recents: readonly string[],
  limit: number,
): readonly T[] {
  const byTo = new Map(navItems.map((item) => [item.to, item]));
  const out: T[] = [];
  for (const to of recents) {
    const item = byTo.get(to);
    if (item) out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Recents show only on an empty query: once typing, the filtered nav group
 *  covers the same destinations. */
export function recentPaletteItems<T extends { readonly to: string }>(
  query: string,
  navItems: readonly T[],
  recents: readonly string[],
  limit: number,
): readonly T[] {
  return query.length === 0
    ? selectRecentNavItems(navItems, recents, limit)
    : [];
}
