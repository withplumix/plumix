import type { CacheProvider, ConnectedCache } from "plumix";

import { EdgeCacheError } from "./errors.js";
import { readEnvString } from "./read-env.js";

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

function cacheControl(config: EdgeConfig): string {
  const directives = [`public`, `s-maxage=${String(config.ttl)}`];
  if (config.staleWhileRevalidate !== undefined) {
    directives.push(
      `stale-while-revalidate=${String(config.staleWhileRevalidate)}`,
    );
  }
  return directives.join(", ");
}

// Clone with the edge cache-control + cache tags applied and any Set-Cookie
// stripped — a shared cache entry must never carry a per-request cookie, and
// the Workers Cache API rejects responses that do.
function forStorage(
  response: Response,
  config: EdgeConfig,
  tags: readonly string[],
): Response {
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  headers.set("cache-control", cacheControl(config));
  if (tags.length > 0) headers.set("cache-tag", tags.join(","));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

interface Credentials {
  readonly zoneId: string;
  readonly purgeToken: string;
}

// Purge by cache-tag is available on all Cloudflare plans (since 2025-04-01),
// not just Enterprise. Failures bubble to the caller, which defers the call so
// a rejection is logged rather than failing the publish.
async function purgeByTag(
  creds: Credentials,
  tags: readonly string[],
): Promise<void> {
  if (tags.length === 0) return;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${creds.zoneId}/purge_cache`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${creds.purgeToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tags }),
    },
  );
  if (!response.ok) {
    throw EdgeCacheError.purgeFailed({ status: response.status });
  }
}

function connectedCache(
  store: EdgeStore,
  config: EdgeConfig,
  creds: Credentials,
): ConnectedCache {
  return {
    match: (request) => store.match(request),
    put: async (request, response, tags) => {
      // The Workers Cache API persists GET responses only.
      if (request.method !== "GET") return;
      await store.put(request, forStorage(response, config, tags));
    },
    purgeTags: (tags) => purgeByTag(creds, tags),
  };
}

/**
 * Cloudflare edge-cache provider backed by the Workers Cache API
 * (`caches.default`) plus the zone purge-by-tag REST API. Disables itself
 * (returns `null` from `connect`) when the deploy lacks the zone credentials
 * needed to purge — pages then render live.
 */
export function edge(config: EdgeConfig): CacheProvider {
  return {
    kind: "cloudflare-edge",
    connect(env) {
      const zoneId = readEnvString(env, ZONE_ID);
      const purgeToken = readEnvString(env, PURGE_TOKEN);
      if (zoneId === undefined || purgeToken === undefined) return null;
      const store = defaultStore();
      if (store === null) return null;
      return connectedCache(store, config, { zoneId, purgeToken });
    },
  };
}
