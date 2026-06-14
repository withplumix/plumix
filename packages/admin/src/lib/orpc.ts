import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import type { AppRouterClient } from "@plumix/core";

import { adminBasePath } from "./admin-base.js";

// Admin and the plumix backend are same-origin in production; prefixing the
// path with `window.location.origin` keeps things same-origin while giving
// `RPCLink` the absolute URL its `new URL(...)` constructor needs — a bare
// path like "/_plumix/rpc" throws "Invalid URL" at `URL` construction time.
// `adminBasePath()` adds the subdirectory prefix under a subdirectory proxy.
// Resolved lazily per call so SSR / prerender contexts (no `window`) can
// import this module without crashing; every actual call runs in the browser.
const link = new RPCLink({
  url: () => `${window.location.origin}${adminBasePath()}/_plumix/rpc`,
  headers: () => ({
    // Dispatcher rejects any non-safe /_plumix/* method missing this header.
    "x-plumix-request": "1",
  }),
});

const client = createORPCClient<AppRouterClient>(link);

export const orpc = createTanstackQueryUtils(client);
