import type { CacheProvider, ConnectedCache } from "plumix";

/**
 * Edge-cache policy for {@link edge}. `ttl` is the edge freshness window in
 * seconds (`s-maxage`); `staleWhileRevalidate` lets a colo serve a stale copy
 * for that many seconds after expiry while it refreshes in the background.
 */
export interface EdgeConfig {
  readonly ttl: number;
  readonly staleWhileRevalidate?: number;
}

// Env keys the purge layer (a later slice) needs. Their presence is also the
// activation gate here: a deploy without a zone + purge token can't safely
// cache (it could never bust a stale page), so caching stays off — which is
// the workers.dev story.
const ZONE_ID = "CF_ZONE_ID";
const PURGE_TOKEN = "CF_CACHE_PURGE_TOKEN";

// Minimal shape of `caches.default`; typed locally so the runtime stays free
// of a hard `@cloudflare/workers-types` dependency at this boundary.
interface EdgeStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function defaultStore(): EdgeStore | null {
  const store = (globalThis as { caches?: { default?: EdgeStore } }).caches;
  return store?.default ?? null;
}

function readCredential(env: unknown, key: string): string | null {
  if (typeof env !== "object" || env === null) return null;
  const value = (env as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function cacheControl(config: EdgeConfig): string {
  const directives = [`public`, `s-maxage=${String(config.ttl)}`];
  if (config.staleWhileRevalidate !== undefined) {
    directives.push(
      `stale-while-revalidate=${String(config.staleWhileRevalidate)}`,
    );
  }
  return directives.join(", ");
}

// Clone with the edge cache-control applied and any Set-Cookie stripped — a
// shared cache entry must never carry a per-request cookie, and the Workers
// Cache API rejects responses that do.
function forStorage(response: Response, config: EdgeConfig): Response {
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  headers.set("cache-control", cacheControl(config));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function connectedCache(store: EdgeStore, config: EdgeConfig): ConnectedCache {
  return {
    match: (request) => store.match(request),
    put: async (request, response) => {
      // The Workers Cache API persists GET responses only.
      if (request.method !== "GET") return;
      await store.put(request, forStorage(response, config));
    },
  };
}

/**
 * Cloudflare edge-cache provider backed by the Workers Cache API
 * (`caches.default`). Disables itself (returns `null` from `connect`) when the
 * deploy lacks the zone credentials needed to purge — pages then render live.
 */
export function edge(config: EdgeConfig): CacheProvider {
  return {
    kind: "cloudflare-edge",
    connect(env) {
      const zoneId = readCredential(env, ZONE_ID);
      const purgeToken = readCredential(env, PURGE_TOKEN);
      if (zoneId === null || purgeToken === null) return null;
      const store = defaultStore();
      if (store === null) return null;
      return connectedCache(store, config);
    },
  };
}
