import { now as currentTime } from "../clock.js";
import { detailOf } from "./island-events.js";

/** A hash: the server sees the same path, and the browser a new cache key. */
export function cacheBustUrl(url: string, now: number): string {
  return `${url}#plumix-retry=${String(now)}`;
}

/**
 * The errors {@link importWithRetry} gave up on, so a hydration error can tell
 * a chunk that never loaded from one that loaded and failed.
 */
const importFailures = new WeakSet();

/**
 * A deploy landing mid-page-load leaves the page pointing at chunks the CDN no
 * longer serves. The retry's failure is the one that rejects.
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
    try {
      return await load(cacheBustUrl(url, currentTime().getTime()));
    } catch (error) {
      if (error !== null && typeof error === "object") {
        importFailures.add(error);
      }
      throw error;
    }
  }
}

export interface ReloadablePage {
  /** The page's URL; each URL reloads at most once per session. */
  readonly url: string;
  /** A getter, since reading `sessionStorage` throws where storage is blocked. */
  readonly storage: () => Pick<Storage, "getItem" | "setItem">;
  readonly reload: () => void;
}

/**
 * A tab opened before a deploy imports chunks the new build no longer serves.
 * Recording the URL first means a chunk broken in this build too can't loop.
 */
export function reloadOnImportFailure(
  event: Event,
  page: ReloadablePage,
): void {
  if (event.defaultPrevented) return;
  const { error } = detailOf(event);
  if (error === null || typeof error !== "object") return;
  if (!importFailures.has(error)) return;
  const key = `plumix:import-failure-reload:${page.url}`;
  try {
    const storage = page.storage();
    if (storage.getItem(key) !== null) return;
    storage.setItem(key, "1");
  } catch {
    return;
  }
  page.reload();
}
