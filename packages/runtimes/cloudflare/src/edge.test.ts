import type { ConnectedCache } from "plumix";
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

  it("returns a connected cache when credentials are present", () => {
    expect(edge({ ttl: 60 }).connect(CREDS)).not.toBeNull();
  });
});

function connect(
  config: EdgeConfig = { ttl: 60, staleWhileRevalidate: 600 },
): ConnectedCache {
  const cache = edge(config).connect(CREDS);
  if (cache === null) throw new Error("expected a connected cache");
  return cache;
}

function storedResponse(): Response {
  const call = store.put.mock.calls[0];
  if (call === undefined) throw new Error("store.put was not called");
  return call[1] as Response;
}

describe("connected cache put", () => {
  it("stores a GET with the edge cache-control derived from policy", async () => {
    await connect().put(
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
    await connect().put(
      new Request("https://site.test/post"),
      new Response("body", { status: 200 }),
      ["t:post", "e:7"],
    );

    expect(storedResponse().headers.get("cache-tag")).toBe("t:post,e:7");
  });

  it("omits the Cache-Tag header when there are no tags", async () => {
    await connect().put(
      new Request("https://site.test/post"),
      new Response("body", { status: 200 }),
      [],
    );

    expect(storedResponse().headers.get("cache-tag")).toBeNull();
  });

  it("strips Set-Cookie from the stored response", async () => {
    const response = new Response("body", { status: 200 });
    response.headers.set("set-cookie", "plumix_session=secret");

    await connect().put(new Request("https://site.test/post"), response, []);

    expect(storedResponse().headers.get("set-cookie")).toBeNull();
  });

  it("does not store non-GET requests (the Cache API is GET-only)", async () => {
    await connect().put(
      new Request("https://site.test/post", { method: "HEAD" }),
      new Response("body", { status: 200 }),
      [],
    );

    expect(store.put).not.toHaveBeenCalled();
  });

  it("omits stale-while-revalidate when the policy has none", async () => {
    await connect({ ttl: 30 }).put(
      new Request("https://site.test/post"),
      new Response("body", { status: 200 }),
      [],
    );

    expect(storedResponse().headers.get("cache-control")).toBe(
      "public, s-maxage=30",
    );
  });
});

describe("connected cache purgeTags", () => {
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
    await connect().purgeTags(["t:post", "e:7"]);

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
    await connect().purgeTags([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the purge API responds non-ok", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(connect().purgeTags(["t:post"])).rejects.toThrow(
      /purge_cache responded 403/,
    );
  });
});
