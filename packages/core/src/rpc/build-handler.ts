import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";

import type { AppContext } from "../context/app.js";
import type { PluginRpcRouter } from "../plugin/manifest.js";
import { appRouter } from "./router.js";

/**
 * Build the merged oRPC handler — core `appRouter` plus the plugin routers.
 * Split out of `buildApp` and loaded via dynamic import so the heavy procedure
 * graph + oRPC runtime evaluate on the first RPC request per isolate, never on
 * the public render cold-start path. Plugin-id collisions are already rejected
 * eagerly in `buildApp`, so the merge here is a plain assign.
 */
export function buildRpcHandler(
  pluginRouters: ReadonlyMap<string, PluginRpcRouter>,
): RPCHandler<AppContext> {
  const mergedRouter = { ...appRouter } as Record<string, unknown>;
  for (const [pluginId, pluginRouter] of pluginRouters) {
    mergedRouter[pluginId] = pluginRouter;
  }
  return new RPCHandler(mergedRouter as unknown as typeof appRouter, {
    plugins: [new ResponseHeadersPlugin()],
  });
}
