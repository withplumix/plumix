import type { CdnStore, ConnectedCdn } from "plumix";
import { describeCdnContract } from "plumix/test/conformance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EdgeConfig } from "./edge.js";
import { edge } from "./edge.js";

interface FakeStore {
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

let store: FakeStore;
const originalCaches = (globalThis as { caches?: unknown }).caches;

beforeEach(() => {
  store = {
    match: vi.fn(() => Promise.resolve(undefined)),
    put: vi.fn(() => Promise.resolve()),
  };
  (globalThis as { caches?: unknown }).caches = { default: store };
});

afterEach(() => {
  (globalThis as { caches?: unknown }).caches = originalCaches;
});

const CREDS = { CF_ZONE_ID: "zone-1", CF_CACHE_PURGE_TOKEN: "token-1" };

describe("edge().connect", () => {
  it("returns null when zone credentials are absent", () => {
    expect(edge({ ttl: 60 }).connect({})).toBeNull();
    expect(edge({ ttl: 60 }).connect({ CF_ZONE_ID: "zone-1" })).toBeNull();
  });

  it("returns a connected cdn when credentials are present", () => {
    expect(edge({ ttl: 60 }).connect(CREDS)).not.toBeNull();
  });
});

function connect(
  config: EdgeConfig = { ttl: 60, staleWhileRevalidate: 600 },
): ConnectedCdn {
  const cdn = edge(config).connect(CREDS);
  if (cdn === null) throw new Error("expected a connected cdn");
  return cdn;
}

function connectStore(config?: EdgeConfig): CdnStore {
  const store = connect(config).store;
  if (store === undefined) throw new Error("expected an origin store");
  return store;
}

function purgeTags(tags: readonly string[]): Promise<void> {
  const purge = connect().purgeTags;
  if (purge === undefined) throw new Error("expected a tag purge");
  return purge(tags);
}

function storedResponse(): Response {
  const call = store.put.mock.calls[0];
  if (call === undefined) throw new Error("store.put was not called");
  return call[1] as Response;
}

describe("connected cdn decorate", () => {
  it("stamps the page freshness on a render that declared none", () => {
    const decorated = connect().decorate(new Response("body"), []);

    expect(decorated.headers.get("cache-control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=600",
    );
  });

  it("emits a comma-joined Cache-Tag header from the page tags", () => {
    const decorated = connect().decorate(new Response("body"), [
      "t:post",
      "e:7",
    ]);

    expect(decorated.headers.get("cache-tag")).toBe("t:post,e:7");
  });

  it("omits the Cache-Tag header when there are no tags", () => {
    expect(
      connect().decorate(new Response("body"), []).headers.get("cache-tag"),
    ).toBeNull();
  });

  it("keeps a handler's own shared freshness instead of the page TTL", () => {
    const decorated = connect().decorate(
      new Response("body", {
        headers: { "cache-control": "public, max-age=31536000, immutable" },
      }),
      ["t:post"],
    );

    expect(decorated.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(decorated.headers.get("cache-tag")).toBe("t:post");
  });

  it("returns a private response untouched and untagged", () => {
    // Decoration narrows what a handler shared; it never widens it. The
    // segment variant that sends these directives is deliberately unshared on
    // the copy the visitor receives, whatever its edge entry does.
    const personalized = new Response("body", {
      headers: { "cache-control": "private, no-store" },
    });

    const decorated = connect().decorate(personalized, ["t:post"]);

    expect(decorated).toBe(personalized);
    expect(decorated.headers.get("cache-tag")).toBeNull();
  });

  it("returns a response that sets a cookie untouched and untagged", () => {
    // The stored copy has its cookie stripped; this one is the visitor's own,
    // so announcing it as shared would hand their cookie to everyone.
    const withCookie = new Response("body", {
      headers: { "set-cookie": "plumix_session=secret" },
    });

    const decorated = connect().decorate(withCookie, ["t:post"]);

    expect(decorated).toBe(withCookie);
    expect(decorated.headers.get("cache-tag")).toBeNull();
  });

  it("omits stale-while-revalidate when the policy has none", () => {
    expect(
      connect({ ttl: 30 })
        .decorate(new Response("body"), [])
        .headers.get("cache-control"),
    ).toBe("public, s-maxage=30");
  });
});

describe("connected cdn put", () => {
  it("stores a GET with the edge cache-control derived from policy", async () => {
    await connectStore().put(
      new Request("https://site.test/post"),
      new Response("body", { status: 200 }),
      [],
    );

    expect(store.put).toHaveBeenCalledOnce();
    expect(storedResponse().headers.get("cache-control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=600",
    );
  });

  it("emits a comma-joined Cache-Tag header from the page tags", async () => {
    await connectStore().put(
      new Request("https://site.test/post"),
      new Response("body", { status: 200 }),
      ["t:post", "e:7"],
    );

    expect(storedResponse().headers.get("cache-tag")).toBe("t:post,e:7");
  });

  it("omits the Cache-Tag header when there are no tags", async () => {
    await connectStore().put(
      new Request("https://site.test/post"),
      new Response("body", { status: 200 }),
      [],
    );

    expect(storedResponse().headers.get("cache-tag")).toBeNull();
  });

  it("strips Set-Cookie from the stored response", async () => {
    const response = new Response("body", { status: 200 });
    response.headers.set("set-cookie", "plumix_session=secret");

    await connectStore().put(
      new Request("https://site.test/post"),
      response,
      [],
    );

    expect(storedResponse().headers.get("set-cookie")).toBeNull();
  });

  it("does not store non-GET requests (the Cache API is GET-only)", async () => {
    await connectStore().put(
      new Request("https://site.test/post", { method: "HEAD" }),
      new Response("body", { status: 200 }),
      [],
    );

    expect(store.put).not.toHaveBeenCalled();
  });

  it("keeps a response's own shared freshness instead of the page TTL", async () => {
    await connectStore().put(
      new Request("https://site.test/og/abc.png"),
      new Response("body", {
        status: 200,
        headers: { "cache-control": "public, max-age=31536000, immutable" },
      }),
      [],
    );

    expect(storedResponse().headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
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

    expect(storedResponse().headers.get("cache-control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=600",
    );
  });

  it("omits stale-while-revalidate when the policy has none", async () => {
    await connectStore({ ttl: 30 }).put(
      new Request("https://site.test/post"),
      new Response("body", { status: 200 }),
      [],
    );

    expect(storedResponse().headers.get("cache-control")).toBe(
      "public, s-maxage=30",
    );
  });
});

describe("connected cdn purgeTags", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs the tags to the zone purge_cache endpoint with the bearer token", async () => {
    await purgeTags(["t:post", "e:7"]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/zones/zone-1/purge_cache",
    );
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body as string)).toEqual({
      tags: ["t:post", "e:7"],
    });
  });

  it("does not call the API for an empty tag list", async () => {
    await purgeTags([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the purge API responds non-ok", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(purgeTags(["t:post"])).rejects.toThrow(
      /purge_cache responded 403/,
    );
  });
});

// The Cache API stub above records calls; the contract needs a store that
// actually holds responses, and a purge endpoint wired back to it — purging on
// Cloudflare is a REST call to the zone, so an isolated `caches.default` can
// never satisfy the contract on its own.
interface EdgeStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface StoredEntry {
  readonly body: string;
  readonly status: number;
  readonly headers: Headers;
  readonly tags: readonly string[];
}

function purgeableEdge(): {
  store: EdgeStore;
  purgeEndpoint: typeof fetch;
} {
  const entries = new Map<string, StoredEntry>();
  return {
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

describe("edge as a cdn slot", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    const edgeStore = purgeableEdge();
    (globalThis as { caches?: unknown }).caches = { default: edgeStore.store };
    globalThis.fetch = edgeStore.purgeEndpoint;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describeCdnContract({ connect, store: true, purgeTags: true });
});
