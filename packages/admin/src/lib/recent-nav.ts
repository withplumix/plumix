const RECENT_KEY = "plumix.v2.palette.recent";
const MAX_STORED = 8;

/** Push a destination to the front of the recently-visited list
 *  (deduped, capped). Silent on failure — recents are a convenience,
 *  not worth surfacing a quota/private-mode error per navigation. */
export function recordRecentNav(to: string): void {
  try {
    const next = [to, ...readRecentNav().filter((t) => t !== to)].slice(
      0,
      MAX_STORED,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* empty */
  }
}

export function readRecentNav(): readonly string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
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
