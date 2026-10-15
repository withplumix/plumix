import { loadWranglerConfig } from "../wrangler-config.js";

const VIRTUAL_ID = "virtual:plumix-cloudflare/workers-caching";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

/**
 * Wrangler config is read here, in Node, because the entry generator ships in
 * the Worker bundle; the answer is baked into the module the entry imports.
 */
const BIND_WORKERS_CACHE = [
  'import { cache } from "cloudflare:workers";',
  'import { bindWorkersCache } from "@plumix/runtime-cloudflare/cdn";',
  "bindWorkersCache(cache);",
  "",
].join("\n");

export interface WorkersCachingPlugin {
  readonly name: string;
  resolveId(id: string): string | undefined;
  load(id: string): string | undefined;
}

/** Serves the entry's `virtual:plumix-cloudflare/workers-caching` import. */
export function workersCaching(root: string): WorkersCachingPlugin {
  return {
    name: "plumix:cloudflare-workers-caching",
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const enabled = loadWranglerConfig(root)?.workersCachingEnabled ?? false;
      return enabled ? BIND_WORKERS_CACHE : "";
    },
  };
}
