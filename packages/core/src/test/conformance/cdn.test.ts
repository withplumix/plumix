import { describe, expect, test } from "vitest";

import type { CdnStore, ConnectedCdn } from "../../runtime/slots.js";
import { responseAllowsSharedStorage } from "../../cdn/decision.js";
import { failingCases } from "./case.js";
import { cdnContractCases, describeCdnContract } from "./cdn.js";

interface CachedEntry {
  readonly body: string;
  readonly status: number;
  readonly headers: Headers;
  readonly tags: readonly string[];
}

// Decoration every provider must do, in the smallest form that satisfies the
// rules: narrow-never-widen, the handler's own freshness preserved, tags on a
// header of the provider's choosing.
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

function byTag(
  entries: Map<string, CachedEntry>,
  tags: readonly string[],
): void {
  for (const [url, entry] of entries) {
    if (entry.tags.some((tag) => tags.includes(tag))) entries.delete(url);
  }
}

// A tag-indexed map is the smallest store that can satisfy the contract, so it
// is what the cases are proved green against here. Cloudflare's `edge()` runs
// them against the Workers Cache API in its own package.
function storefulCdn(
  purge: (entries: Map<string, CachedEntry>, tags: readonly string[]) => void,
): ConnectedCdn {
  const entries = new Map<string, CachedEntry>();
  return {
    decorate,
    store: mapEntries(entries),
    purgeTags: (tags) => {
      purge(entries, tags);
      return Promise.resolve();
    },
  };
}

function mapEntries(entries: Map<string, CachedEntry>): CdnStore {
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
      // Re-headered on the way in: the entry is what a hit serves, so it has
      // to leave as cacheable as a decorated miss would.
      const stored = decorate(response, tags);
      const headers = new Headers(stored.headers);
      headers.delete("set-cookie");
      entries.set(request.url, {
        body: await stored.text(),
        status: stored.status,
        headers,
        tags: [...tags],
      });
    },
  };
}

// The four optional-member combinations a provider can ship. Cloudflare
// Workers is the first; a header-only CDN with a purge API is the second; the
// rest are supported configurations rather than broken providers.
describeCdnContract({
  connect: () => storefulCdn(byTag),
  store: true,
  purgeTags: true,
});

describe("storeless, with purge", () => {
  describeCdnContract({
    connect: () => ({ decorate, purgeTags: () => Promise.resolve() }),
    purgeTags: true,
  });
});

describe("store, no purge", () => {
  describeCdnContract({
    connect: () => ({ decorate, store: mapEntries(new Map()) }),
    store: true,
  });
});

describe("storeless, no purge", () => {
  describeCdnContract({ connect: () => ({ decorate }) });
});

/** A cdn that stores whatever it is handed, cookie and method included. */
function leakyCdn(): ConnectedCdn {
  const entries = new Map<string, CachedEntry>();
  return {
    decorate,
    store: {
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
    },
    purgeTags: () => Promise.resolve(),
  };
}

const stateful = { store: true, purgeTags: true } as const;

describe("cdn contract cases", () => {
  test("fail a cdn that stores a non-GET request", async () => {
    const failed = await failingCases(cdnContractCases, {
      connect: leakyCdn,
      ...stateful,
    });
    expect(failed).toContain("a non-GET request is not stored");
  });

  test("fail a cdn that hands back the response's Set-Cookie", async () => {
    const failed = await failingCases(cdnContractCases, {
      connect: leakyCdn,
      ...stateful,
    });
    expect(failed).toContain(
      "a stored response does not carry the response's Set-Cookie",
    );
  });

  test("fail a cdn whose purge does nothing", async () => {
    const failed = await failingCases(cdnContractCases, {
      connect: () => storefulCdn(() => undefined),
      ...stateful,
    });
    expect(failed).toContain("purging a tag drops every response carrying it");
  });

  test("fail a cdn whose purge empties the store", async () => {
    const failed = await failingCases(cdnContractCases, {
      connect: () => storefulCdn((entries) => entries.clear()),
      ...stateful,
    });
    expect(failed).toContain(
      "purging a tag leaves responses that do not carry it",
    );
  });

  test("fail a cdn whose decorate widens a private response", async () => {
    const failed = await failingCases(cdnContractCases, {
      connect: () => ({
        // Stamps the site TTL over whatever the handler declared — the widening
        // the port exists to forbid.
        decorate: (response, tags) => {
          const headers = new Headers(response.headers);
          headers.set("cache-control", "public, s-maxage=60");
          if (tags.length > 0) headers.set("cache-tag", tags.join(","));
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        },
      }),
    });
    expect(failed).toContain(
      "decorate returns a private response untouched and untagged",
    );
  });

  test("fail a cdn whose decorate overwrites a declared freshness", async () => {
    const failed = await failingCases(cdnContractCases, {
      connect: () => ({
        decorate: (response) =>
          new Response(response.body, {
            status: response.status,
            headers: { "cache-control": "public, s-maxage=60" },
          }),
      }),
    });
    expect(failed).toContain(
      "decorate preserves a shared-cacheable freshness the response declared",
    );
  });

  test("fail a cdn whose decorate shares a response that sets a cookie", async () => {
    const failed = await failingCases(cdnContractCases, {
      connect: () => ({
        decorate: (response, tags) => {
          if (!responseAllowsSharedStorage(response)) return response;
          const headers = new Headers(response.headers);
          headers.set("cache-control", "public, s-maxage=60");
          if (tags.length > 0) headers.set("cache-tag", tags.join(","));
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        },
      }),
    });
    expect(failed).toContain(
      "decorate returns a response that sets a cookie untouched and untagged",
    );
  });

  test("fail a store whose entry comes back untagged", async () => {
    const failed = await failingCases(cdnContractCases, {
      connect: leakyCdn,
      ...stateful,
    });
    expect(failed).toContain("a stored response comes back carrying its tags");
  });

  test("fail a cdn whose decorate drops the tags", async () => {
    const failed = await failingCases(cdnContractCases, {
      connect: () => ({ decorate: (response) => response }),
    });
    expect(failed).toContain("decorate carries the tags it is handed");
  });

  test("fail a cdn that ships members it did not declare", async () => {
    const failed = await failingCases(cdnContractCases, {
      connect: () => storefulCdn(byTag),
    });
    expect(failed).toContain(
      "the optional members present are the ones declared",
    );
  });
});
