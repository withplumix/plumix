import type { PlumixEnv } from "plumix";
import type {
  AssetsBinding,
  PlumixApp,
  PlumixHandler,
  RuntimeAdapter,
} from "plumix/runtime";
import { createPlumixHandler, DRAIN_DEADLINE_MS } from "plumix/runtime";

import { generateEntry } from "./entry-codegen.js";
import { ASSETS_DIR_ENV } from "./entry-constants.js";
import { BunConfigError, MAX_IDLE_TIMEOUT_S } from "./errors.js";
import { createAssetsLayer } from "./http/assets.js";

export interface BunConfig {
  /**
   * Trust `x-forwarded-proto`, `x-forwarded-host` and the rightmost
   * `x-forwarded-for` entry — for a process behind a TLS-terminating proxy.
   * Off by default, so a visitor reaching the process directly cannot forge
   * its scheme, host or address.
   */
  readonly trustProxy?: boolean;
  /**
   * Bytes a request body may carry; 1 GiB by default. Bun enforces it and
   * answers 413 before the site runs.
   */
  readonly bodySizeLimit?: number;
  /**
   * Seconds a connection may sit idle, a response still pending included;
   * 30 by default, where Bun's own 10 would drop a slow render. `0` disables
   * it. At most 255, Bun's ceiling. An event stream is exempt either way.
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
    createHandler,
    generateEntry,
    commandsModule: "@plumix/runtime-bun/commands",
  };
}

export function isBunRuntime(
  adapter: RuntimeAdapter,
): adapter is BunRuntimeAdapter {
  return adapter.name === "bun";
}

// The default handler is the whole adapter; the serve path already put the
// client address from `server.requestIP` on the invocation. The env is fixed
// for a handler's lifetime, so the layer is built once.
function createHandler(app: PlumixApp): PlumixHandler {
  let assets: AssetsBinding | undefined;
  return createPlumixHandler(app, {
    assets: (env) => (assets ??= readAssetsBinding(env)),
    disposeTimeoutMs: DRAIN_DEADLINE_MS,
  });
}
