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

import { RPCLink } from "@orpc/client/fetch";

/**
 * Calls a procedure the plugin registered via `ctx.registerRpcRouter`.
 * `procedure` is the router path under the plugin's own namespace — e.g.
 * `"list"` or `"locations/list"` for a plugin id of `"menu"`, never
 * prefixed with the plugin id itself.
 */
export interface PluginRpcClient {
  call<TOutput>(procedure: string, input?: unknown): Promise<TOutput>;
}

function basePath(): string {
  return (
    (globalThis as { plumix?: { basePath?: string } }).plumix?.basePath ?? ""
  );
}

/**
 * `pluginId` must match what the plugin passed to `definePlugin` — procedures
 * mount at `/_plumix/rpc/<pluginId>/*` (see `registerRpcRouter`).
 */
export function createPluginRpcClient(pluginId: string): PluginRpcClient {
  const link = new RPCLink<Record<never, never>>({
    // Same-origin absolute URL: a bare path like "/_plumix/rpc" throws
    // "Invalid URL" at `RPCLink`'s `new URL(...)` construction time.
    // `basePath()` adds the subdirectory prefix under a subdirectory proxy.
    url: () => `${globalThis.location.origin}${basePath()}/_plumix/rpc`,
    headers: () => ({
      // The dispatcher rejects any non-safe /_plumix/* method missing this.
      "x-plumix-request": "1",
    }),
    // `RPCLink` otherwise binds `globalThis.fetch` at construction, freezing
    // whichever implementation existed when this module first loaded.
    fetch: (request, init) => globalThis.fetch(request, init),
  });
  return {
    call: <TOutput>(procedure: string, input?: unknown) =>
      link.call([pluginId, ...procedure.split("/").filter(Boolean)], input, {
        context: {},
      }) as Promise<TOutput>,
  };
}
