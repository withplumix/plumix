import type { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanstackRouter } from "@tanstack/react-router";

import { ADMIN_BASE_PATH } from "../lib/constants.js";
import { routeTree } from "../routeTree.gen.js";

// No explicit return type: TS infers the narrow Router<typeof routeTree, ...>
// which gives Link/useNavigate full route-level autocomplete downstream.
export function createRouter(queryClient: QueryClient) {
  return createTanstackRouter({
    routeTree,
    basepath: ADMIN_BASE_PATH,
    defaultPreload: "intent",
    // Defer freshness to Query's own cache — avoids two competing
    // SWR policies fighting over the same data.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    context: { queryClient },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
