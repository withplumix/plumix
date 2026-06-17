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
    );

    expect(store.put).toHaveBeenCalledOnce();
    expect(storedResponse().headers.get("cache-control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=600",
    );
  });

  it("strips Set-Cookie from the stored response", async () => {
    const response = new Response("body", { status: 200 });
    response.headers.set("set-cookie", "plumix_session=secret");

    await connect().put(new Request("https://site.test/post"), response);

    expect(storedResponse().headers.get("set-cookie")).toBeNull();
  });

  it("does not store non-GET requests (the Cache API is GET-only)", async () => {
    await connect().put(
      new Request("https://site.test/post", { method: "HEAD" }),
      new Response("body", { status: 200 }),
    );

    expect(store.put).not.toHaveBeenCalled();
  });

  it("omits stale-while-revalidate when the policy has none", async () => {
    await connect({ ttl: 30 }).put(
      new Request("https://site.test/post"),
      new Response("body", { status: 200 }),
    );

    expect(storedResponse().headers.get("cache-control")).toBe(
      "public, s-maxage=30",
    );
  });
});
