import type { AnyRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import { renderWithI18n } from "./render-with-i18n.js";

/**
 * Render under a real TanStack router backed by memory history, so a component
 * that calls `useNavigate` moves an actual location instead of reporting a
 * call. Returns the live location to assert on. The route tree is a single
 * catch-all: the admin's own tree would drag every route module (and its
 * loaders) into a component test, and what these tests need from routing is
 * that a `to` template and its params resolve to the URL the author intended.
 */
export async function renderWithRouter(
  node: ReactNode,
): Promise<{ readonly pathname: () => string }> {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        {node}
        <Outlet />
      </>
    ),
  });
  const catchAll = createRoute({
    getParentRoute: () => rootRoute,
    path: "$",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([catchAll]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // The router resolves its first match asynchronously; without this the
  // initial render is the router's pending state and the subject isn't mounted
  // yet when the test starts driving it.
  await router.load();
  renderWithI18n(<RouterProvider router={router} />);
  return { pathname: () => router.state.location.pathname };
}

interface RouteMount {
  /** The route's own path template, as its file declares it. */
  readonly path: string;
  /** The URL the router opens on. */
  readonly url: string;
  /** What the signed-in user may do, as `_authenticated` would hand it down. */
  readonly capabilities: readonly string[];
}

/**
 * Mount a real admin route — its loaders, queries and component — under a root
 * that stands in for `_authenticated`, without the rest of the tree. Queries
 * don't retry, so a failed load reaches the screen before `findBy` gives up.
 */
export async function renderRoute(
  route: AnyRoute,
  { path, url, capabilities }: RouteMount,
): Promise<void> {
  const rootRoute = createRootRoute({
    beforeLoad: () => ({ user: { id: 1, capabilities } }),
  });
  // The file route was built against the generated tree's parent; re-parenting
  // it is what `update` is for, but its options type is pinned to that tree.
  const mounted = route.update({
    id: path,
    path,
    getParentRoute: () => rootRoute,
  } as never);
  const router = createRouter({
    routeTree: rootRoute.addChildren([mounted]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();
  renderWithI18n(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
