import type { CdnStore, ConnectedCdn } from "../runtime/contract/slots.js";
import { responseAllowsSharedStorage } from "../cdn/decision.js";

interface StoredResponse {
  readonly body: string;
  readonly status: number;
  readonly headers: Headers;
  readonly tags: readonly string[];
}

/**
 * An in-memory cdn to hand the harness as `cdn`. Each assertion throws a plain
 * `Error` listing what is stored, so any test runner reads it.
 */
export interface CdnFake extends ConnectedCdn {
  readonly store: CdnStore;
  readonly purgeTags: NonNullable<ConnectedCdn["purgeTags"]>;
  readonly purgeAll: NonNullable<ConnectedCdn["purgeAll"]>;
  /** Throws unless a response is stored for `path`, its search included. */
  readonly assertStored: (path: string) => void;
  readonly assertNotStored: (path: string) => void;
}

export function fakeCdn(): CdnFake {
  const stored = new Map<string, StoredResponse>();

  function fail(expectation: string): never {
    throw new Error(`${expectation}\n${describeStored(stored)}`);
  }

  return {
    assertStored: (path) => {
      if (storedPaths(stored).includes(path)) return;
      fail(`Expected "${path}" to be stored, but it is not.`);
    },
    assertNotStored: (path) => {
      if (!storedPaths(stored).includes(path)) return;
      fail(`Expected "${path}" not to be stored, but it is.`);
    },
    decorate,
    store: {
      match: (request) => {
        const hit = stored.get(request.url);
        return Promise.resolve(
          hit === undefined
            ? undefined
            : new Response(hit.body, {
                status: hit.status,
                headers: hit.headers,
              }),
        );
      },
      put: async (request, response, tags) => {
        if (request.method !== "GET") return;
        // Re-headered on the way in, as a provider does: a hit is served
        // straight to a visitor, so it leaves as cacheable as a decorated miss.
        const decorated = decorate(response, tags);
        const headers = new Headers(decorated.headers);
        headers.delete("set-cookie");
        stored.set(request.url, {
          body: await decorated.text(),
          status: decorated.status,
          headers,
          tags: [...tags],
        });
      },
    },
    purgeTags: (tags) => {
      for (const [url, hit] of stored) {
        if (hit.tags.some((tag) => tags.includes(tag))) stored.delete(url);
      }
      return Promise.resolve();
    },
    purgeAll: () => {
      stored.clear();
      return Promise.resolve();
    },
  };
}

function decorate(response: Response, tags: readonly string[]): Response {
  if (response.headers.has("set-cookie")) return response;
  if (!responseAllowsSharedStorage(response)) return response;
  const headers = new Headers(response.headers);
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, s-maxage=60");
  }
  if (tags.length > 0) headers.set("cache-tag", tags.join(","));
  return new Response(response.body, { status: response.status, headers });
}

function storedPaths(stored: ReadonlyMap<string, StoredResponse>): string[] {
  return [...stored.keys()].map((url) => {
    const { pathname, search } = new URL(url);
    return `${pathname}${search}`;
  });
}

function describeStored(stored: ReadonlyMap<string, StoredResponse>): string {
  const paths = storedPaths(stored);
  if (paths.length === 0) return "Nothing is stored.";
  return ["Stored:", ...paths.map((path) => `  - ${path}`)].join("\n");
}
