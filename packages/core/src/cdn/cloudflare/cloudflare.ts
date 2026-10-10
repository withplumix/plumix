import type { PlumixEnv } from "../../runtime/contract/bindings.js";
import type { EnvInput } from "../../runtime/contract/env-input.js";
import type {
  CdnProvider,
  CdnStore,
  ConnectedCdn,
} from "../../runtime/contract/slots.js";
import { resolveEnvInput } from "../../runtime/contract/env-input.js";
import { responseAllowsSharedStorage } from "../decision.js";
import { CloudflareCdnError } from "./errors.js";

/**
 * `ttl` is the edge freshness in seconds (`s-maxage`); `staleWhileRevalidate`
 * is how many seconds past expiry a colo may serve stale while refreshing.
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

// Drops `private`/`no-store`: a segment variant sends them for intermediaries,
// yet its separately keyed edge entry is deliberately shared. Only `forStorage`
// may widen like this.
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

// A visitor's `Set-Cookie` can't be stripped here as on the stored copy;
// stamping shared freshness beside it would hand that cookie to everyone.
function decorate(
  response: Response,
  config: CloudflareCdnConfig,
  tags: readonly string[],
): Response {
  if (response.headers.has("set-cookie")) return response;
  if (!responseAllowsSharedStorage(response)) return response;
  return withHeaders(response, cdnHeaders(response, config, tags));
}

// The Workers Cache API rejects a response carrying `Set-Cookie`. Delete before
// building the `Response`, whose header guard would make the delete a no-op.
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

// Cloudflare refuses a `purge_cache` call carrying more than this many tags.
const PURGE_TAG_LIMIT = 100;

async function purgeGroup(
  zoneId: string,
  purgeToken: string,
  tags: readonly string[],
): Promise<void> {
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

// Rejections bubble to the caller, which defers the purge, so a zone that
// refuses a call is logged rather than failing the publish. The groups are
// sent concurrently.
async function purgeByTag(
  zoneId: string,
  purgeToken: string,
  tags: readonly string[],
): Promise<void> {
  const groups: (readonly string[])[] = [];
  for (let start = 0; start < tags.length; start += PURGE_TAG_LIMIT) {
    groups.push(tags.slice(start, start + PURGE_TAG_LIMIT));
  }
  // One refused group must not cut the others short, so every call settles
  // before the first refusal is rethrown.
  const results = await Promise.allSettled(
    groups.map((group) => purgeGroup(zoneId, purgeToken, group)),
  );
  const refused = results.find((result) => result.status === "rejected");
  if (refused !== undefined) throw refused.reason;
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
 * Silently inert when either credential resolves empty. Cloudflare caches no
 * HTML without a zone Cache Rule, and pages held by Workers Caching
 * (`cache.enabled`) are beyond this provider's purge.
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
