// Serves through core's `stubRpcEndpoint`, the same stub the admin's tests
// use, so the two cannot drift apart on the wire.

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
 * Answers with a specific oRPC error instead of a generic 500. `status` must
 * be below 200 or at least 400; others can't reach the client and answer 500.
 */
export const PluginRpcError = RpcReplyError;
export type PluginRpcError = RpcReplyError;

/**
 * Routes are keyed by procedure path under the plugin's namespace and typed
 * against `TRouter`. An unrouted procedure answers 404, so a test can't pass
 * on an undeclared call.
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
