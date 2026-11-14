import { WorkersCachingConfigError } from "../errors.js";
import { SHARED_CACHE_ENTRYPOINT } from "../shared-cache.js";
import { entrypointCached, loadWranglerConfig } from "../wrangler-config.js";

const VIRTUAL_ID = "virtual:plumix-cloudflare/workers-caching";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

/**
 * The module-level `exports` reaches the cached entrypoint's purge from
 * `fetch` and `scheduled` alike, with no invocation to thread through.
 */
const GATEWAY_ON = [
  'import { exports } from "cloudflare:workers";',
  'import { bindWorkersCache } from "@plumix/runtime-cloudflare/cdn";',
  `bindWorkersCache({ purge: (options) => exports.${SHARED_CACHE_ENTRYPOINT}.purge(options) });`,
  "export const sharedEntrypointCached = true;",
  "",
].join("\n");

const GATEWAY_OFF = "export const sharedEntrypointCached = false;\n";

export interface WorkersCachingPlugin {
  readonly name: string;
  buildStart(): void;
  resolveId(id: string): string | undefined;
  load(id: string): string | undefined;
}

/**
 * Wrangler config is read here, in Node, because the entry generator ships in
 * the Worker bundle; the answer is baked into the module the entry imports.
 */
export function workersCaching(root: string): WorkersCachingPlugin {
  return {
    name: "plumix:cloudflare-workers-caching",
    buildStart() {
      const config = loadWranglerConfig(root);
      if (config !== null && entrypointCached(config, "default")) {
        throw WorkersCachingConfigError.defaultEntrypointCached({
          filename: config.filename,
          sharedCacheEntrypoint: SHARED_CACHE_ENTRYPOINT,
        });
      }
    },
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const config = loadWranglerConfig(root);
      const cached =
        config !== null && entrypointCached(config, SHARED_CACHE_ENTRYPOINT);
      return cached ? GATEWAY_ON : GATEWAY_OFF;
    },
  };
}
