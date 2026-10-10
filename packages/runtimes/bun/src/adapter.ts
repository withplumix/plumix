import type { PlumixEnv } from "plumix";
import type {
  AssetsBinding,
  RuntimeAdapter,
  RuntimeHandlerSpec,
} from "plumix/runtime";
import { DRAIN_DEADLINE_MS } from "plumix/runtime";

import { generateEntry } from "./entry-codegen.js";
import { ASSETS_DIR_ENV } from "./entry-constants.js";
import { BunConfigError, MAX_IDLE_TIMEOUT_S } from "./errors.js";
import { createAssetsLayer } from "./http/assets.js";

export interface BunConfig {
  /**
   * For a process behind a TLS-terminating proxy. Off by default, so a direct
   * visitor cannot forge scheme, host or address.
   */
  readonly trustProxy?: boolean;
  /**
   * Bytes a request body may carry; 1 GiB by default. Bun enforces it and
   * answers 413 before the site runs.
   */
  readonly bodySizeLimit?: number;
  /**
   * 30 by default, where Bun's own 10 would drop a slow render. `0` disables
   * it; at most 255, Bun's ceiling. Event streams are exempt.
   */
  readonly idleTimeout?: number;
  readonly build?: {
    /**
     * Packages the server bundle imports at runtime instead of inlining.
     * Every `bun:` module, `sharp`, `better-sqlite3` and the libsql client
     * family are external without being listed.
     */
    readonly external?: readonly string[];
  };
}

export interface ResolvedBunConfig extends BunConfig {
  readonly trustProxy: boolean;
  readonly bodySizeLimit: number;
  readonly idleTimeout: number;
}

export interface BunRuntimeAdapter extends RuntimeAdapter {
  readonly config: ResolvedBunConfig;
}

const DEFAULT_BODY_SIZE_LIMIT = 1024 * 1024 * 1024;
const DEFAULT_IDLE_TIMEOUT_S = 30;

function readAssetsBinding(env: PlumixEnv): AssetsBinding | undefined {
  const dir = (env as { readonly [ASSETS_DIR_ENV]?: unknown })[ASSETS_DIR_ENV];
  return typeof dir === "string" && dir !== ""
    ? createAssetsLayer({ root: dir })
    : undefined;
}

/**
 * An env is fixed for a handler's lifetime, so each env's layer is built once.
 */
const assetsLayers = new WeakMap<PlumixEnv, AssetsBinding | undefined>();

const handler: RuntimeHandlerSpec = {
  assets: (env) => {
    if (!assetsLayers.has(env)) assetsLayers.set(env, readAssetsBinding(env));
    return assetsLayers.get(env);
  },
  disposeTimeoutMs: DRAIN_DEADLINE_MS,
};

/** The Bun runtime adapter: a process on `Bun.serve`. */
export function bun(config: BunConfig = {}): BunRuntimeAdapter {
  // `??`, never `||`: 0 is the value that disables the timeout.
  const idleTimeout = config.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_S;
  if (idleTimeout > MAX_IDLE_TIMEOUT_S) {
    throw BunConfigError.idleTimeoutTooLong({ idleTimeout });
  }
  return {
    name: "bun",
    config: {
      ...config,
      trustProxy: config.trustProxy ?? false,
      bodySizeLimit: config.bodySizeLimit ?? DEFAULT_BODY_SIZE_LIMIT,
      idleTimeout,
    },
    handler,
    generateEntry,
    commandsModule: "@plumix/runtime-bun/commands",
  };
}

export function isBunRuntime(
  adapter: RuntimeAdapter,
): adapter is BunRuntimeAdapter {
  return adapter.name === "bun";
}
