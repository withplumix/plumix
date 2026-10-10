import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";

import type { AppContext } from "../context/app-context.js";
import type { PluginRpcRouter } from "../plugin/manifest.js";
import { appRouter } from "./router.js";

/**
 * Loaded via dynamic import so the procedure graph and oRPC runtime stay off
 * the public render cold-start path.
 */
export function buildRpcHandler(
  pluginRouters: ReadonlyMap<string, PluginRpcRouter>,
): RPCHandler<AppContext> {
  const mergedRouter = { ...appRouter } as Record<string, unknown>;
  for (const [pluginId, pluginRouter] of pluginRouters) {
    mergedRouter[pluginId] = pluginRouter;
  }
  // Safety: the merge only adds keys, and `buildApp` rejects plugin ids that
  // collide with a core procedure, so none is replaced.
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
