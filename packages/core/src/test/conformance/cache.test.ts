import { describe, expect, test } from "vitest";

import type { ConnectedCache } from "../../runtime/slots.js";
import { cacheContractCases, describeCacheContract } from "./cache.js";
import { failingCases } from "./case.js";

interface CachedEntry {
  readonly body: string;
  readonly status: number;
  readonly headers: Headers;
  readonly tags: readonly string[];
}

// A tag-indexed map is the smallest store that can satisfy the contract, so it
// is what the cases are proved green against here. Cloudflare's `edge()` runs
// them against the Workers Cache API in its own package.
function mapCache(
  purge: (entries: Map<string, CachedEntry>, tags: readonly string[]) => void,
): ConnectedCache {
  const entries = new Map<string, CachedEntry>();
  return {
    match: (request) => {
      const entry = entries.get(request.url);
      return Promise.resolve(
        entry
          ? new Response(entry.body, {
              status: entry.status,
              headers: entry.headers,
            })
          : undefined,
      );
    },
    put: async (request, response, tags) => {
      if (request.method !== "GET") return;
      const headers = new Headers(response.headers);
      headers.delete("set-cookie");
      entries.set(request.url, {
        body: await response.text(),
        status: response.status,
        headers,
        tags: [...tags],
      });
    },
    purgeTags: (tags) => {
      purge(entries, tags);
      return Promise.resolve();
    },
  };
}

function byTag(
  entries: Map<string, CachedEntry>,
  tags: readonly string[],
): void {
  for (const [url, entry] of entries) {
    if (entry.tags.some((tag) => tags.includes(tag))) entries.delete(url);
  }
}

describeCacheContract({ connect: () => mapCache(byTag) });

/** A cache that stores whatever it is handed, cookie and method included. */
function leakyCache(): ConnectedCache {
  const entries = new Map<string, CachedEntry>();
  return {
    match: (request) => {
      const entry = entries.get(request.url);
      return Promise.resolve(
        entry
          ? new Response(entry.body, {
              status: entry.status,
              headers: entry.headers,
            })
          : undefined,
      );
    },
    put: async (request, response, tags) => {
      entries.set(request.url, {
        body: await response.text(),
        status: response.status,
        headers: new Headers(response.headers),
        tags: [...tags],
      });
    },
    purgeTags: () => Promise.resolve(),
  };
}

describe("cache contract cases", () => {
  test("fail a cache that stores a non-GET request", async () => {
    const failed = await failingCases(cacheContractCases, {
      connect: leakyCache,
    });
    expect(failed).toContain("a non-GET request is not stored");
  });

  test("fail a cache that hands back the response's Set-Cookie", async () => {
    const failed = await failingCases(cacheContractCases, {
      connect: leakyCache,
    });
    expect(failed).toContain(
      "a stored response does not carry the response's Set-Cookie",
    );
  });

  test("fail a cache whose purge does nothing", async () => {
    const failed = await failingCases(cacheContractCases, {
      connect: () => mapCache(() => undefined),
    });
    expect(failed).toContain("purging a tag drops every response carrying it");
  });

  test("fail a cache whose purge empties the store", async () => {
    const failed = await failingCases(cacheContractCases, {
      connect: () => mapCache((entries) => entries.clear()),
    });
    expect(failed).toContain(
      "purging a tag leaves responses that do not carry it",
    );
  });
});
