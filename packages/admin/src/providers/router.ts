import type { QueryClient } from "@tanstack/react-query";
import type { ParsedLocation } from "@tanstack/react-router";
import { createRouter as createTanstackRouter } from "@tanstack/react-router";

import type { ViewTransitionType } from "@plumix/core/support";
import { viewTransitionTypes } from "@plumix/core/support";

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
    defaultViewTransition: { types: navigationTransitionTypes },
  });
}

interface NavigationChange {
  readonly fromLocation?: ParsedLocation;
  readonly toLocation: ParsedLocation;
  readonly pathChanged: boolean;
}

/**
 * The view transition types a navigation starts with, by the direction it
 * moves through history, or `false` for no transition: on the first load,
 * when only the search params or hash changed, and when the user prefers
 * reduced motion.
 */
function navigationTransitionTypes({
  fromLocation,
  toLocation,
  pathChanged,
}: NavigationChange): ViewTransitionType[] | false {
  if (fromLocation === undefined || !pathChanged) return false;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const from = fromLocation.state.__TSR_index;
  const to = toLocation.state.__TSR_index;
  if (to < from) return [viewTransitionTypes.back];
  if (to === from) return [viewTransitionTypes.replace];
  return [viewTransitionTypes.forward];
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
