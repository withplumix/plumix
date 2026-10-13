/** A hash: the server sees the same path, and the browser a new cache key. */
export function cacheBustUrl(url: string, now: number): string {
  return `${url}#plumix-retry=${String(now)}`;
}

/**
 * A deploy that lands mid-page-load leaves the page pointing at chunks the CDN
 * no longer serves, so a failed import waits, then tries once more at a
 * cache-busted URL. The retry's failure is the one that rejects.
 */
export async function importWithRetry<T>(
  load: (url: string) => Promise<T>,
  url: string,
  wait: () => Promise<void>,
): Promise<T> {
  try {
    return await load(url);
  } catch {
    await wait();
    return load(cacheBustUrl(url, Date.now()));
  }
}
