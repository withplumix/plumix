import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import type { AppRouterClient } from "@plumix/core";

import { adminBasePath } from "./admin-base.js";

/**
 * `RPCLink` needs an absolute URL (a bare path throws "Invalid URL"). Lazy so
 * SSR contexts without `window` can import this module.
 */
const link = new RPCLink({
  url: () => `${window.location.origin}${adminBasePath()}/_plumix/rpc`,
  headers: () => ({
    // Dispatcher rejects any non-safe /_plumix/* method missing this header.
    "x-plumix-request": "1",
  }),
  // Otherwise `RPCLink` freezes `globalThis.fetch` at import. Forward `init`'s
  // `redirect: "manual"`, or a followed 3xx's HTML parses as an RPC envelope.
  fetch: (request, init) => globalThis.fetch(request, init),
});

const client = createORPCClient<AppRouterClient>(link);

export const orpc = createTanstackQueryUtils(client);
