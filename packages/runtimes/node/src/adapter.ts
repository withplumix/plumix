import type {
  AssetsBinding,
  PlumixApp,
  PlumixEnv,
  PlumixHandler,
  RuntimeAdapter,
} from "plumix";
import { createPlumixHandler } from "plumix";

import { generateEntry } from "./entry-codegen.js";
import { ASSETS_DIR_ENV, DRAIN_DEADLINE_MS } from "./entry-constants.js";
import { createAssetsLayer } from "./http/assets.js";

export interface NodeConfig {
  /**
   * Trust `x-forwarded-proto`, `x-forwarded-host` and the rightmost
   * `x-forwarded-for` entry — for a process behind a TLS-terminating proxy.
   * Off by default, so a visitor reaching the process directly cannot forge
   * its scheme, host or address.
   */
  readonly trustProxy?: boolean;
  /** Bytes a request body may carry; 1 GiB by default. */
  readonly bodySizeLimit?: number;
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

/** The Node.js runtime adapter: a plain process over `node:http`. */
export function node(config: NodeConfig = {}): NodeRuntimeAdapter {
  return {
    name: "node",
    config,
    createHandler,
    generateEntry,
    commandsModule: "@plumix/runtime-node/commands",
  };
}

export function isNodeRuntime(
  adapter: RuntimeAdapter,
): adapter is NodeRuntimeAdapter {
  return adapter.name === "node";
}

// The default handler is the whole adapter; the bridge already supplied the
// client address on the invocation, so nothing is read off the request here.
// The env is fixed for a handler's lifetime, so the layer is built once.
function createHandler(app: PlumixApp): PlumixHandler {
  let assets: AssetsBinding | undefined;
  return createPlumixHandler(app, {
    assets: (env) => (assets ??= readAssetsBinding(env)),
    disposeTimeoutMs: DRAIN_DEADLINE_MS,
  });
}
