import type { ConnectedCdn } from "../runtime/contract/slots.js";

export interface MemoryCdn {
  /** Pass to `createDispatcherHarness({ cdn })`. */
  readonly cdn: ConnectedCdn;
  /**
   * The tags the entry stored for `path` (pathname plus query) carries, or
   * `undefined` when nothing is stored there — never stored, or purged since.
   */
  readonly stored: (path: string) => readonly string[] | undefined;
}

/**
 * A CDN that stores and purges for real, in memory: an entry is keyed by its
 * request URL and dropped by a purge of any tag it carries. A test renders a
 * page, makes a write, and asserts the stored page is gone, which proves the
 * property a purge exists for rather than the tags either side spelled.
 */
export function memoryCdn(): MemoryCdn {
  const entries = new Map<
    string,
    { readonly response: Response; readonly tags: readonly string[] }
  >();
  const cdn: ConnectedCdn = {
    decorate: (response) => response,
    store: {
      match: (request) =>
        Promise.resolve(entries.get(request.url)?.response.clone()),
      put: (request, response, tags) => {
        entries.set(request.url, { response, tags });
        return Promise.resolve();
      },
    },
    purgeTags: (tags) => {
      for (const [url, entry] of entries) {
        if (entry.tags.some((tag) => tags.includes(tag))) entries.delete(url);
      }
      return Promise.resolve();
    },
  };
  return {
    cdn,
    stored: (path) => {
      for (const [url, entry] of entries) {
        const { pathname, search } = new URL(url);
        if (`${pathname}${search}` === path) return entry.tags;
      }
      return undefined;
    },
  };
}
