import type { ReactNode } from "react";
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
