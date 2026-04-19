import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { AppRouterClient } from "@plumix/core";

// Admin and worker are same-origin in production, so a relative URL works
// everywhere without env-specific configuration.
const RPC_PREFIX = "/_plumix/rpc" as const;

export function createRpcClient(): AppRouterClient {
  const link = new RPCLink({
    url: RPC_PREFIX,
    headers: () => ({
      // Dispatcher rejects any non-safe /_plumix/* method missing this header.
      "x-plumix-request": "1",
    }),
  });
  return createORPCClient<AppRouterClient>(link);
}
