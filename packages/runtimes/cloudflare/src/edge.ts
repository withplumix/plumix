import type { CdnProvider, ConnectedCdn } from "plumix";
import { responseAllowsSharedStorage } from "plumix";

import { EdgeCdnError } from "./errors.js";
import { readEnvString } from "./read-env.js";

/**
 * CDN policy for {@link edge}. `ttl` is the edge freshness window in
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

function pageCacheControl(config: EdgeConfig): string {
  const directives = [`public`, `s-maxage=${String(config.ttl)}`];
  if (config.staleWhileRevalidate !== undefined) {
    directives.push(
      `stale-while-revalidate=${String(config.staleWhileRevalidate)}`,
    );
  }
  return directives.join(", ");
}

// The freshness the stored copy carries: the caller's own where it declared one
// a shared cache may act on — a content-addressed asset asking for
// `max-age=31536000, immutable` keeps exactly that — and the site-wide page TTL
// otherwise. `private` and `no-store` are the two that never survive, because
// they address the copy going back to the visitor rather than this one: a
// segment variant sends them so no intermediary reuses its render, while its
// edge entry is deliberately shared, and honoring them here would leave that
// page uncacheable. Widening is safe here and nowhere else — this copy is keyed
// separately from anything the visitor holds.
function storageCacheControl(response: Response, config: EdgeConfig): string {
  const declared = response.headers.get("cache-control");
  if (declared !== null && responseAllowsSharedStorage(response))
    return declared;
  return pageCacheControl(config);
}

// The zone reads `Cache-Tag`, comma-separated. Both copies carry it; the
// header name and separator are this provider's to choose.
function tagged(headers: Headers, tags: readonly string[]): Headers {
  if (tags.length > 0) headers.set("cache-tag", tags.join(","));
  return headers;
}

function withHeaders(response: Response, headers: Headers): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * The copy the visitor receives, carrying the freshness and cache tags the zone
 * reads. Two responses leave exactly as they arrived, untouched and untagged:
 * one whose own directive already refused shared storage, and one carrying a
 * `Set-Cookie` — that cookie cannot be stripped the way the stored copy's is,
 * and stamping shared freshness beside it would hand one visitor's cookie to
 * everyone behind the CDN. A declared shared-cacheable freshness is preserved;
 * the site's page TTL is stamped only where the response declared none.
 */
function decorate(
  response: Response,
  config: EdgeConfig,
  tags: readonly string[],
): Response {
  if (response.headers.has("set-cookie")) return response;
  if (!responseAllowsSharedStorage(response)) return response;
  const headers = new Headers(response.headers);
  if (!headers.has("cache-control")) {
    headers.set("cache-control", pageCacheControl(config));
  }
  return withHeaders(response, tagged(headers, tags));
}

// Clone with the storage cache-control + cache tags applied and any Set-Cookie
// stripped — a shared cache entry must never carry a per-request cookie, and
// the Workers Cache API rejects responses that do.
function forStorage(
  response: Response,
  config: EdgeConfig,
  tags: readonly string[],
): Response {
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  headers.set("cache-control", storageCacheControl(response, config));
  return withHeaders(response, tagged(headers, tags));
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
    throw EdgeCdnError.purgeFailed({ status: response.status });
  }
}

function connectedCdn(
  store: EdgeStore,
  config: EdgeConfig,
  creds: Credentials,
): ConnectedCdn {
  return {
    decorate: (response, tags) => decorate(response, config, tags),
    store: {
      match: (request) => store.match(request),
      put: async (request, response, tags) => {
        // The Workers Cache API persists GET responses only.
        if (request.method !== "GET") return;
        await store.put(request, forStorage(response, config, tags));
      },
    },
    purgeTags: (tags) => purgeByTag(creds, tags),
  };
}

/**
 * Cloudflare CDN provider: freshness and cache tags on every public response,
 * the Workers Cache API (`caches.default`) as its origin store, and the zone
 * purge-by-tag REST API. Disables itself (returns `null` from `connect`) when
 * the deploy lacks the zone credentials needed to purge — pages then render
 * live.
 */
export function edge(config: EdgeConfig): CdnProvider {
  return {
    kind: "cloudflare-edge",
    connect(env) {
      const zoneId = readEnvString(env, ZONE_ID);
      const purgeToken = readEnvString(env, PURGE_TOKEN);
      if (zoneId === undefined || purgeToken === undefined) return null;
      const store = defaultStore();
      if (store === null) return null;
      return connectedCdn(store, config, { zoneId, purgeToken });
    },
  };
}
