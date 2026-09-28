// Test-only counterpart to `createPluginRpcClient` (see `../admin/plugin-rpc.ts`):
// serve a plugin's RPC procedures from the test instead of the network, by
// substituting `fetch` — the platform boundary the real client already calls
// through. Every plugin admin shell test used to hand-roll this (URL-suffix
// matching, envelope construction, error-body shape) independently; this is
// the one copy.
//
// The serving itself is `stubRpcEndpoint` from `@plumix/core/test/browser`, the
// same `RPCHandler`-backed stub the admin's own tests answer the core router
// with, so the two cannot drift apart on the wire. What is plugin-specific here
// is only where the procedures mount. That subpath carries no Node dependency,
// so this module serves both builds of `plumix/test`.

import type { PluginRpcRouter } from "@plumix/core";
import type {
  RpcStub,
  RpcStubCall,
  RpcStubRoutes,
} from "@plumix/core/test/browser";
import { RpcReplyError, stubRpcEndpoint } from "@plumix/core/test/browser";

/** One RPC request the client sent, decoded from the wire envelope. */
export type PluginRpcCall<TRouter extends PluginRpcRouter = never> =
  RpcStubCall<TRouter>;

export type PluginRpcStub<TRouter extends PluginRpcRouter = never> =
  RpcStub<TRouter>;

/**
 * Throw from a route responder to answer with a specific oRPC error shape —
 * e.g. the CONFLICT a version-mismatch save returns — instead of the generic
 * 500 an unannotated throw produces.
 *
 * `status` has to be one an error envelope can carry: below 200 or 400 and up.
 * The protocol has no way to express a 2xx/3xx failure, so one given here
 * cannot reach the client and answers 500 instead.
 */
export const PluginRpcError = RpcReplyError;
export type PluginRpcError = RpcReplyError;

/**
 * Routes are keyed by procedure path under the plugin's own namespace:
 * `{ "locations/list": () => [] }` for a plugin id of `"menu"`. An unrouted
 * procedure answers 404, so a test can't pass by accident on a call it never
 * declared.
 *
 * Pass the router type the plugin already hands `createPluginRpcClient` —
 * `stubPluginRpc<MenuRouter>("menu", …)` — and the route map is checked
 * against it: an unknown path, a responder reading the wrong input or
 * returning the wrong output is a type error.
 */
export function stubPluginRpc<TRouter extends PluginRpcRouter = never>(
  pluginId: string,
  routes: RpcStubRoutes<NoInfer<TRouter>>,
): PluginRpcStub<TRouter> {
  return stubRpcEndpoint<TRouter>({
    prefix: `/_plumix/rpc/${pluginId}`,
    routes,
    unservedHint:
      "check the plugin id passed to stubPluginRpc against the one the " +
      "client was created with.",
  });
}
