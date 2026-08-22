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
  // Safety: the merge only adds keys — every core procedure is still present
  // under its own name, and plugin ids are rejected in `buildApp` if they
  // collide with one, so no procedure `appRouter` declares has been replaced.
  const merged = mergedRouter as unknown as typeof appRouter;
  return new RPCHandler(merged, {
    plugins: [new ResponseHeadersPlugin()],
    // One span per matched procedure — plugin routers included, since they
    // merge into this handler. Middleware (auth) runs inside the call, so its
    // spans nest under the procedure's.
    clientInterceptors: [
      (options) => {
        const procedure = options.path.join(".");
        return options.context.telemetry.span(`rpc: ${procedure}`, (s) => {
          s.set("rpc.procedure", procedure);
          return options.next();
        });
      },
    ],
  });
}
