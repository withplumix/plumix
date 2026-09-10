import type { PlumixEnv } from "../../runtime/bindings.js";
import type { EnvInput } from "../../runtime/env-input.js";
import type {
  CdnProvider,
  CdnStore,
  ConnectedCdn,
} from "../../runtime/slots.js";
import { resolveEnvInput } from "../../runtime/env-input.js";
import { responseAllowsSharedStorage } from "../decision.js";
import { CloudflareCdnError } from "./errors.js";

/**
 * Cloudflare CDN policy. `ttl` is the edge freshness window in seconds
 * (`s-maxage`); `staleWhileRevalidate` lets a colo serve a stale copy for that
 * many seconds after expiry while it refreshes in the background.
 */
export interface CloudflareCdnConfig {
  readonly ttl: number;
  readonly staleWhileRevalidate?: number;
  /** Zone id, or an `(env) => zoneId` resolver read on connect. */
  readonly zoneId: EnvInput<string | undefined>;
  /**
   * API token with the zone's `Cache Purge` permission, or a resolver for it.
   * Purge by cache tag is available on every Cloudflare plan since 2025-04-01.
   */
  readonly purgeToken: EnvInput<string | undefined>;
}

// Minimal shape of `caches.default` — present on Workers and nowhere else —
// typed locally so core takes no `@cloudflare/workers-types` dependency.
interface WorkersCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function workersCache(): WorkersCache | null {
  const caches = (globalThis as { caches?: { default?: WorkersCache } }).caches;
  return caches?.default ?? null;
}

function pageCacheControl(config: CloudflareCdnConfig): string {
  const directives = [`public`, `s-maxage=${String(config.ttl)}`];
  if (config.staleWhileRevalidate !== undefined) {
    directives.push(
      `stale-while-revalidate=${String(config.staleWhileRevalidate)}`,
    );
  }
  return directives.join(", ");
}

// The caller's own freshness where it declared one a shared cache may act on —
// a content-addressed asset asking for `max-age=31536000, immutable` keeps
// exactly that — and the site-wide page TTL otherwise. `private` and `no-store`
// never survive: they address the copy going back to the visitor rather than a
// shared one. A segment variant sends them so no intermediary reuses its
// render, while its edge entry is deliberately shared, and honoring them on
// that entry would leave the page uncacheable. Which is why only `forStorage`
// may reach this arm — widening is safe on a separately keyed copy and nowhere
// else.
function sharedCacheControl(
  response: Response,
  config: CloudflareCdnConfig,
): string {
  const declared = response.headers.get("cache-control");
  if (declared !== null && responseAllowsSharedStorage(response))
    return declared;
  return pageCacheControl(config);
}

// The zone reads `Cache-Tag`, comma-separated. The header name and the
// separator are this provider's to choose.
function cdnHeaders(
  response: Response,
  config: CloudflareCdnConfig,
  tags: readonly string[],
): Headers {
  const headers = new Headers(response.headers);
  headers.set("cache-control", sharedCacheControl(response, config));
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
 * The copy the visitor receives. Two responses leave exactly as they arrived,
 * untouched and untagged: one whose own directive already refused shared
 * storage, and one carrying a `Set-Cookie` — that cookie cannot be stripped the
 * way the stored copy's is, and stamping shared freshness beside it would hand
 * one visitor's cookie to everyone behind the CDN.
 */
function decorate(
  response: Response,
  config: CloudflareCdnConfig,
  tags: readonly string[],
): Response {
  if (response.headers.has("set-cookie")) return response;
  if (!responseAllowsSharedStorage(response)) return response;
  return withHeaders(response, cdnHeaders(response, config, tags));
}

// A shared cache entry must never carry a per-request cookie, and the Workers
// Cache API rejects a response that does. Deleted on the copied `Headers`,
// before the `Response` whose header guard would make the delete a no-op.
function forStorage(
  response: Response,
  config: CloudflareCdnConfig,
  tags: readonly string[],
): Response {
  const headers = cdnHeaders(response, config, tags);
  headers.delete("set-cookie");
  return withHeaders(response, headers);
}

function originStore(
  cache: WorkersCache,
  config: CloudflareCdnConfig,
): CdnStore {
  return {
    match: (request) => cache.match(request),
    put: async (request, response, tags) => {
      // The Workers Cache API persists GET responses only.
      if (request.method !== "GET") return;
      await cache.put(request, forStorage(response, config, tags));
    },
  };
}

// Rejections bubble to the caller, which defers the purge, so a zone that
// refuses one is logged rather than failing the publish.
async function purgeByTag(
  zoneId: string,
  purgeToken: string,
  tags: readonly string[],
): Promise<void> {
  if (tags.length === 0) return;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${purgeToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tags }),
    },
  );
  if (!response.ok) {
    throw CloudflareCdnError.purgeFailed({ status: response.status });
  }
}

// A var declared and left blank is the same deploy as one never set.
function credential(
  input: EnvInput<string | undefined>,
  env: PlumixEnv,
): string | undefined {
  const value = resolveEnvInput(input, env);
  return value === undefined || value.length === 0 ? undefined : value;
}

/**
 * Cloudflare CDN provider: freshness and cache tags on every public response,
 * and purge by cache tag through the zone API — both of which work from any
 * host behind the zone, a Worker, a container or a VM alike. On Workers it
 * additionally stores through the Cache API, because a Worker runs in front of
 * its own zone's cache and the zone never holds what the Worker returns. The
 * store is discovered rather than configured.
 *
 * Inert (`connect` returns `null`, pages render live) when either credential
 * resolves to nothing on this deploy — a `workers.dev` host, a container with
 * no token yet. Emitting freshness that could never be purged is the worse
 * failure, and nothing cached can go stale, so it is silent: the debug bar's
 * slot row is where it shows.
 *
 * Note that Cloudflare does not cache HTML without a Cache Rule on the zone. A
 * deploy that emits perfect headers still caches nothing until that rule exists.
 *
 * Workers Caching (`cache.enabled` in wrangler config) honours the same headers
 * but is purged only through its own binding, so a deploy that enables it holds
 * pages this provider cannot invalidate (#2265).
 */
export function cloudflare(config: CloudflareCdnConfig): CdnProvider {
  return {
    kind: "cloudflare",
    connect(env) {
      const zoneId = credential(config.zoneId, env);
      const purgeToken = credential(config.purgeToken, env);
      if (zoneId === undefined || purgeToken === undefined) return null;
      const cache = workersCache();
      const connected: ConnectedCdn = {
        decorate: (response, tags) => decorate(response, config, tags),
        purgeTags: (tags) => purgeByTag(zoneId, purgeToken, tags),
      };
      if (cache === null) return connected;
      return { ...connected, store: originStore(cache, config) };
    },
  };
}
