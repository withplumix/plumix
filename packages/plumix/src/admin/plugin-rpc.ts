// Bare `@orpc/client*` imports are intentional: the plugin-bundle step rewrites
// them to the host's shared runtime instance.

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { PluginRpcClient, PluginRpcRouter } from "@plumix/core";

import { basePath } from "./runtime.js";

/**
 * Import `TRouter` with `import type` so server code stays out of the admin
 * bundle. `pluginId` must match what the plugin passed to `definePlugin`.
 */
export function createPluginRpcClient<TRouter extends PluginRpcRouter>(
  pluginId: string,
): PluginRpcClient<TRouter> {
  const link = new RPCLink<Record<never, never>>({
    // Same-origin absolute URL: a bare path like "/_plumix/rpc" throws
    // "Invalid URL" at `RPCLink`'s `new URL(...)` construction time.
    // `basePath()` adds the subdirectory prefix under a subdirectory proxy.
    url: () =>
      `${globalThis.location.origin}${basePath()}/_plumix/rpc/${pluginId}`,
    headers: () => ({
      // The dispatcher rejects any non-safe /_plumix/* method missing this.
      "x-plumix-request": "1",
    }),
    // `RPCLink` otherwise binds `globalThis.fetch` at construction, freezing
    // whichever implementation existed when this module first loaded.
    fetch: (request, init) => globalThis.fetch(request, init),
  });
  return createORPCClient<PluginRpcClient<TRouter>>(link);
}
