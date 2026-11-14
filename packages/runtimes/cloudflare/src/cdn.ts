import type { CdnProvider } from "plumix";
import type { CloudflareCdnConfig } from "plumix/cdn/cloudflare";
import { cloudflare as zoneCloudflare } from "plumix/cdn/cloudflare";
import { tryGetContext } from "plumix/plugin";

import { WorkersCachePurgeError } from "./errors.js";
import { forwardedByGateway, sharedCacheRequest } from "./shared-cache.js";

/**
 * The cached entrypoint, typed locally: jiti loads this module in Node with
 * the config, so the generated entry binds it instead.
 */
export interface WorkersCache {
  fetch(request: Request): Promise<Response>;
  purge(options: { tags?: string[]; purgeEverything?: boolean }): Promise<{
    success: boolean;
    errors: { code: number; message: string }[];
  }>;
}

/** Workers Caching takes at most this many tags in one `purge` call. */
const PURGE_TAG_LIMIT = 1000;

let workersCache: WorkersCache | null = null;

/**
 * Must run before the app connects its slots, which read the binding. `null` is
 * a deploy whose wrangler config does not cache the shared entrypoint.
 */
export function bindWorkersCache(cache: WorkersCache | null): void {
  workersCache = cache;
}

/**
 * A refusal resolves rather than rejects, so it is recorded on the request's
 * `cdn` telemetry and turned into a rejection the caller's deferral logs.
 */
async function purge(
  cache: WorkersCache,
  options: Parameters<WorkersCache["purge"]>[0],
): Promise<void> {
  const result = await cache.purge(options);
  if (!result.success) {
    tryGetContext()?.telemetry.record("cdn", {
      purge: "workers-caching",
      success: false,
      errors: result.errors,
    });
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
 * Core's provider, plus Workers Caching (`cache.enabled` in wrangler config):
 * its purge, which the zone's `purge_cache` does not clear, and its copies as
 * the front cache.
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
        frontCache: {
          read: (request) => cache.fetch(sharedCacheRequest(request)),
          forwarded: forwardedByGateway,
        },
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
