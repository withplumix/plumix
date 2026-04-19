import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { AppRouterClient } from "@plumix/core";

// The worker dispatcher mounts RPC under /_plumix/rpc (see
// packages/core/src/runtime/dispatcher.ts). Admin and worker are same-origin
// when deployed, so a relative URL is correct in every environment.
const RPC_PREFIX = "/_plumix/rpc" as const;

export function createRpcClient(): AppRouterClient {
  const link = new RPCLink({
    url: RPC_PREFIX,
    headers: () => ({
      // CSRF header required by the dispatcher's pre-check on every /_plumix/*
      // non-safe method. Keeping it on reads too is harmless.
      "x-plumix-request": "1",
    }),
  });
  return createORPCClient<AppRouterClient>(link);
}
