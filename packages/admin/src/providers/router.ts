import type { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanstackRouter } from "@tanstack/react-router";

import { ErrorBoundaryFallback } from "../components/error-boundary-fallback.js";
import { adminBasePath } from "../lib/admin-base.js";
import { ADMIN_BASE_PATH } from "../lib/constants.js";
import { routeTree } from "../routeTree.gen.js";

// No explicit return type: TS infers the narrow Router<typeof routeTree, ...>
// which gives Link/useNavigate full route-level autocomplete downstream.
export function createRouter(queryClient: QueryClient) {
  return createTanstackRouter({
    routeTree,
    // Prefix the admin mount with the deployment's subdirectory (if any) so
    // deep links and navigation resolve under a subdirectory proxy.
    basepath: `${adminBasePath()}${ADMIN_BASE_PATH}`,
    defaultPreload: "intent",
    // Defer freshness to Query's own cache — avoids two competing
    // SWR policies fighting over the same data.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    // Routes without their own `errorComponent` fall here instead of
    // TanStack's hardcoded-English `ErrorComponent`.
    defaultErrorComponent: ErrorBoundaryFallback,
    context: { queryClient },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
