import type { PlumixEnv } from "plumix";
import type {
  AssetsBinding,
  RuntimeAdapter,
  RuntimeHandlerSpec,
} from "plumix/runtime";
import { DRAIN_DEADLINE_MS } from "plumix/runtime";

import { generateEntry } from "./entry-codegen.js";
import { ASSETS_DIR_ENV } from "./entry-constants.js";
import { createAssetsLayer } from "./http/assets.js";

export interface NodeConfig {
  /**
   * For a process behind a TLS-terminating proxy. Off by default, so a direct
   * visitor cannot forge scheme, host or address.
   */
  readonly trustProxy?: boolean;
  /** Bytes a request body may carry; 1 GiB by default. */
  readonly bodySizeLimit?: number;
  /**
   * On by default: runs are guarded in the database, so every replica may keep
   * a timer. Turn off to drive `plumix cron run` from a system cron instead.
   */
  readonly cron?: boolean;
  readonly build?: {
    /**
     * Packages the server bundle imports at runtime instead of inlining —
     * native modules the bundler cannot carry. `sharp`, `better-sqlite3` and
     * the libsql client family are external without being listed.
     */
    readonly external?: readonly string[];
  };
}

export interface NodeRuntimeAdapter extends RuntimeAdapter {
  readonly config: NodeConfig;
}

function readAssetsBinding(env: PlumixEnv): AssetsBinding | undefined {
  const dir = (env as { readonly [ASSETS_DIR_ENV]?: unknown })[ASSETS_DIR_ENV];
  return typeof dir === "string" && dir !== ""
    ? createAssetsLayer({ root: dir })
    : undefined;
}

// An env is fixed for a handler's lifetime, so each env's layer is built once.
const assetsLayers = new WeakMap<PlumixEnv, AssetsBinding | undefined>();

const handler: RuntimeHandlerSpec = {
  assets: (env) => {
    if (!assetsLayers.has(env)) assetsLayers.set(env, readAssetsBinding(env));
    return assetsLayers.get(env);
  },
  disposeTimeoutMs: DRAIN_DEADLINE_MS,
};

/** The Node.js runtime adapter: a plain process over `node:http`. */
export function node(config: NodeConfig = {}): NodeRuntimeAdapter {
  return {
    name: "node",
    config,
    handler,
    generateEntry,
    commandsModule: "@plumix/runtime-node/commands",
  };
}

export function isNodeRuntime(
  adapter: RuntimeAdapter,
): adapter is NodeRuntimeAdapter {
  return adapter.name === "node";
}
