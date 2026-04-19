import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import type { AppRouterClient } from "@plumix/core";

// Admin and the plumix backend are same-origin in production; a relative
// URL works everywhere regardless of which runtime adapter is deployed.
const link = new RPCLink({
  url: "/_plumix/rpc",
  headers: () => ({
    // Dispatcher rejects any non-safe /_plumix/* method missing this header.
    "x-plumix-request": "1",
  }),
});

const client = createORPCClient<AppRouterClient>(link);

export const orpc = createTanstackQueryUtils(client);
