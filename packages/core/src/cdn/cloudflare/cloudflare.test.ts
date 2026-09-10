import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlumixEnv } from "../../runtime/bindings.js";
import type { CdnStore, ConnectedCdn } from "../../runtime/slots.js";
import type { CloudflareCdnConfig } from "./cloudflare.js";
import { describeCdnContract } from "../../test/conformance/cdn.js";
import { cloudflare } from "./cloudflare.js";

// The rules every provider shares — narrow-never-widen decoration, a stored
// copy without the visitor's cookie, purge by tag — are asserted by the two
// contract runs at the bottom. What is left here is what only this vendor
// answers for: the exact `Cache-Control` and `Cache-Tag` it writes, and the
// shape of its purge request.
const CREDS = { zoneId: "zone-1", purgeToken: "token-1" } as const;
const PAGE_FRESHNESS = "public, s-maxage=60, stale-while-revalidate=600";
const EMPTY_ENV = {} as PlumixEnv;

// One shape for both fakes and for the provider's own view of `caches.default`.
interface FakeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

let cache: { match: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
let fetchMock: ReturnType<typeof vi.fn>;
const originalCaches = (globalThis as { caches?: unknown }).caches;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  cache = {
    match: vi.fn(() => Promise.resolve(undefined)),
    put: vi.fn(() => Promise.resolve()),
  };
  (globalThis as { caches?: unknown }).caches = { default: cache };
  fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  (globalThis as { caches?: unknown }).caches = originalCaches;
  globalThis.fetch = originalFetch;
});

function connect(config: Partial<CloudflareCdnConfig> = {}): ConnectedCdn {
  const cdn = cloudflare({
    ttl: 60,
    staleWhileRevalidate: 600,
    ...CREDS,
    ...config,
  }).connect(EMPTY_ENV);
  if (cdn === null) throw new Error("expected a connected cdn");
  return cdn;
}

function connectStore(): CdnStore {
  const store = connect().store;
  if (store === undefined) throw new Error("expected an origin store");
  return store;
}

function storedResponse(): Response {
  const call = cache.put.mock.calls[0];
  if (call === undefined) throw new Error("the cache was not written");
  return call[1] as Response;
}

function purgeTags(tags: readonly string[]): Promise<void> {
  const purge = connect().purgeTags;
  if (purge === undefined) throw new Error("expected a tag purge");
  return purge(tags);
}

describe("cloudflare().connect", () => {
  it("is inert when either credential resolves to nothing", () => {
    const config = { ttl: 60, ...CREDS };
    expect(
      cloudflare({ ...config, zoneId: undefined }).connect(EMPTY_ENV),
    ).toBeNull();
    expect(
      cloudflare({ ...config, purgeToken: undefined }).connect(EMPTY_ENV),
    ).toBeNull();
    expect(
      cloudflare({ ...config, zoneId: () => undefined }).connect(EMPTY_ENV),
    ).toBeNull();
    // An env var declared and left blank is the same deploy as one never set.
    expect(
      cloudflare({ ...config, purgeToken: () => "" }).connect(EMPTY_ENV),
    ).toBeNull();
  });

  it("reads credentials from the env through a resolver", async () => {
    const env = { CF_ZONE_ID: "zone-9", CF_PURGE: "token-9" } as PlumixEnv & {
      CF_ZONE_ID: string;
      CF_PURGE: string;
    };

    const cdn = cloudflare({
      ttl: 60,
      zoneId: (read) => (read as typeof env).CF_ZONE_ID,
      purgeToken: (read) => (read as typeof env).CF_PURGE,
    }).connect(env);

    // Followed through to the purge call: a resolver that ran but whose value
    // never reached the request would satisfy a bare non-null check.
    await cdn?.purgeTags?.(["t:post"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/zones/zone-9/purge_cache");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer token-9",
    );
  });

  it("decorates and purges with no store off Workers", () => {
    delete (globalThis as { caches?: unknown }).caches;

    const cdn = connect();

    expect(cdn.store).toBeUndefined();
    expect(cdn.purgeTags).toBeDefined();
    expect(
      cdn.decorate(new Response("body"), []).headers.get("cache-control"),
    ).toBe(PAGE_FRESHNESS);
  });
});

describe("connected cdn decorate", () => {
  it("stamps the page freshness on a render that declared none", () => {
    expect(
      connect().decorate(new Response("body"), []).headers.get("cache-control"),
    ).toBe(PAGE_FRESHNESS);
  });

  it("emits a comma-joined Cache-Tag header from the page tags", () => {
    expect(
      connect()
        .decorate(new Response("body"), ["t:post", "e:7"])
        .headers.get("cache-tag"),
    ).toBe("t:post,e:7");
  });

  it("omits the Cache-Tag header when there are no tags", () => {
    expect(
      connect().decorate(new Response("body"), []).headers.get("cache-tag"),
    ).toBeNull();
  });

  it("omits stale-while-revalidate when the policy has none", () => {
    expect(
      connect({ staleWhileRevalidate: undefined })
        .decorate(new Response("body"), [])
        .headers.get("cache-control"),
    ).toBe("public, s-maxage=60");
  });
});

describe("connected cdn put", () => {
  it("stores a GET under the page freshness and its tags", async () => {
    await connectStore().put(
      new Request("https://site.test/post"),
      new Response("body", { status: 200 }),
      ["t:post", "e:7"],
    );

    expect(storedResponse().headers.get("cache-control")).toBe(PAGE_FRESHNESS);
    expect(storedResponse().headers.get("cache-tag")).toBe("t:post,e:7");
  });

  it("does not store a HEAD (the Cache API is GET-only)", async () => {
    // The contract makes the same point with a POST; the Cache API refuses
    // every non-GET, and HEAD is the one a read-through could plausibly send.
    await connectStore().put(
      new Request("https://site.test/post", { method: "HEAD" }),
      new Response("body", { status: 200 }),
      [],
    );

    expect(cache.put).not.toHaveBeenCalled();
  });

  it("applies the page TTL to a response whose cache-control forbids sharing", async () => {
    // A segment variant tells the *client* copy not to be stored while its
    // edge copy is deliberately shared — that directive must not survive here.
    await connectStore().put(
      new Request("https://site.test/members"),
      new Response("body", {
        status: 200,
        headers: { "cache-control": "private, no-store" },
      }),
      [],
    );

    expect(storedResponse().headers.get("cache-control")).toBe(PAGE_FRESHNESS);
  });
});

describe("connected cdn purgeTags", () => {
  it("POSTs the tags to the zone purge_cache endpoint with the bearer token", async () => {
    await purgeTags(["t:post", "e:7"]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/zones/zone-1/purge_cache",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer token-1",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      tags: ["t:post", "e:7"],
    });
  });

  it("does not call the API for an empty tag list", async () => {
    await purgeTags([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when the purge API refuses, so the deferred call logs it", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));

    await expect(purgeTags(["t:post"])).rejects.toThrow(
      /purge_cache responded 403/,
    );
  });
});

// The contract needs a cache that actually holds responses and a purge
// endpoint wired back to it — purging here is a REST call to the zone, so an
// isolated `caches.default` can never satisfy the contract on its own.
interface StoredEntry {
  readonly body: string;
  readonly status: number;
  readonly headers: Headers;
  readonly tags: readonly string[];
}

function purgeableZone(): { cache: FakeCache; purgeEndpoint: typeof fetch } {
  const entries = new Map<string, StoredEntry>();
  return {
    cache: {
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
      put: async (request, response) => {
        const tags = (response.headers.get("cache-tag") ?? "")
          .split(",")
          .filter((tag) => tag.length > 0);
        entries.set(request.url, {
          body: await response.text(),
          status: response.status,
          headers: new Headers(response.headers),
          tags,
        });
      },
    },
    purgeEndpoint: (_url, init) => {
      const body = typeof init?.body === "string" ? init.body : "{}";
      const { tags } = JSON.parse(body) as { tags: string[] };
      for (const [url, entry] of entries) {
        if (entry.tags.some((tag) => tags.includes(tag))) entries.delete(url);
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    },
  };
}

describe("on a runtime with a response store", () => {
  beforeEach(() => {
    const zone = purgeableZone();
    (globalThis as { caches?: unknown }).caches = { default: zone.cache };
    globalThis.fetch = zone.purgeEndpoint;
  });

  describeCdnContract({ connect, store: true, purgeTags: true });
});

describe("on a runtime with no response store", () => {
  beforeEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
  });

  describeCdnContract({ connect, purgeTags: true });
});
