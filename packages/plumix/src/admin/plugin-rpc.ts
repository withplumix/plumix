// One published client for plugin admin code to call its own server-
// registered RPC procedures. Every plugin admin chunk used to hand-roll the
// same wire protocol — `POST ${base}/_plumix/rpc/<proc>`, a
// `{ json, meta: [] }` body, the `x-plumix-request` header, and hand-parsed
// error-envelope unwrapping. This client speaks the real StandardRPC
// protocol via oRPC's own `RPCLink`, so a failed call throws the actual
// `ORPCError` the server raised (`.data` carries whatever the procedure's
// `errors.XXX({ data })` attached) instead of a re-derived `Error`.
//
// Bare `@orpc/client*` imports here are intentional, not a mistake to
// dedupe: when a plugin's admin chunk bundles this module in, the plugin-
// bundle build step rewrites them to the host's shared runtime instance
// (see `@plumix/core/admin`'s `SHARED_ADMIN_RUNTIME_SPECIFIERS`), the same
// way it would if the plugin had written the import itself.

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { PluginRpcClient, PluginRpcRouter } from "@plumix/core";

function basePath(): string {
  return (
    (globalThis as { plumix?: { basePath?: string } }).plumix?.basePath ?? ""
  );
}

/**
 * `TRouter` is the type of what the plugin's server module hands
 * `ctx.registerRpcRouter` — import it with `import type`, so the server code
 * stays out of the admin bundle. `pluginId` must match what the plugin passed
 * to `definePlugin`: procedures mount at `/_plumix/rpc/<pluginId>/*` (see
 * `registerRpcRouter`), and the client reaches `menu.locations.list` as
 * `rpc.locations.list(input)`.
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
