import { describe, expect, test } from "vitest";

import type { ConnectedCache } from "../../runtime/slots.js";
import { cacheContractCases, describeCacheContract } from "./cache.js";
import { failingCases } from "./case.js";

interface CachedEntry {
  readonly body: string;
  readonly status: number;
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
        entry ? new Response(entry.body, { status: entry.status }) : undefined,
      );
    },
    put: async (request, response, tags) => {
      entries.set(request.url, {
        body: await response.text(),
        status: response.status,
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

describe("cache contract cases", () => {
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
