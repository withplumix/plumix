import { createRouterClient } from "@orpc/server";

import type { AppContext } from "../context/app-context.js";
import { appRouter } from "../rpc/router.js";

/**
 * Calls an RPC procedure as the request's principal, token scopes included, so
 * the procedure's own gates decide. Its edit leases record surface `mcp`.
 */
export function mcpRouterClient(ctx: AppContext) {
  return createRouterClient(appRouter, {
    context: { ...ctx, leaseSurface: "mcp" },
  });
}
