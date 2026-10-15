import type { CdnProvider } from "plumix";
import type { CloudflareCdnConfig } from "plumix/cdn/cloudflare";
import { cloudflare as zoneCloudflare } from "plumix/cdn/cloudflare";

import { WorkersCachePurgeError } from "./errors.js";

/**
 * The `cache` export of `cloudflare:workers`, typed locally: jiti loads this
 * module in Node with the config, so the generated entry imports it instead.
 */
export interface WorkersCache {
  purge(options: { tags?: string[]; purgeEverything?: boolean }): Promise<{
    success: boolean;
    errors: { code: number; message: string }[];
  }>;
}

/** Workers Caching takes at most this many tags in one `purge` call. */
const PURGE_TAG_LIMIT = 1000;

let workersCache: WorkersCache | null = null;

/**
 * Called by the generated Worker entry when the site's wrangler config sets
 * `cache.enabled`, before the app connects its slots. `null` is a deploy with
 * Workers Caching off.
 */
export function bindWorkersCache(cache: WorkersCache | null): void {
  workersCache = cache;
}

/**
 * A refusal resolves rather than rejects, so it is turned into a rejection the
 * caller's deferral logs.
 */
async function purge(
  cache: WorkersCache,
  options: Parameters<WorkersCache["purge"]>[0],
): Promise<void> {
  const result = await cache.purge(options);
  if (!result.success) {
    throw WorkersCachePurgeError.purgeFailed({ errors: result.errors });
  }
}

function purgeByTag(
  cache: WorkersCache,
  tags: readonly string[],
): Promise<void>[] {
  const calls: Promise<void>[] = [];
  for (let start = 0; start < tags.length; start += PURGE_TAG_LIMIT) {
    calls.push(
      purge(cache, { tags: tags.slice(start, start + PURGE_TAG_LIMIT) }),
    );
  }
  return calls;
}

/**
 * One refused purge must not cut the others short, so every call settles
 * before the first refusal is rethrown.
 */
async function settle(calls: readonly Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(calls);
  const refused = results.find((result) => result.status === "rejected");
  if (refused !== undefined) throw refused.reason;
}

/**
 * Core's provider, plus the purge only a Worker can reach: Workers Caching
 * (`cache.enabled` in wrangler config), which the zone's `purge_cache` does not
 * clear.
 */
export function cloudflare(config: CloudflareCdnConfig): CdnProvider {
  const zone = zoneCloudflare(config);
  return {
    kind: zone.kind,
    connect(env) {
      const connected = zone.connect(env);
      const cache = workersCache;
      if (connected === null || cache === null) return connected;
      const { purgeTags, purgeAll } = connected;
      return {
        ...connected,
        purgeTags: (tags) =>
          settle([
            ...(purgeTags === undefined ? [] : [purgeTags(tags)]),
            ...purgeByTag(cache, tags),
          ]),
        purgeAll: () =>
          settle([
            ...(purgeAll === undefined ? [] : [purgeAll()]),
            purge(cache, { purgeEverything: true }),
          ]),
      };
    },
  };
}
