import type * as ReactRouter from "@tanstack/react-router";

import { getRuntime } from "./runtime.js";

// Each binding is annotated with the upstream type it re-exports. Inferred,
// the compiler prints the module that declares a symbol, which for some is
// `@tanstack/router-core` or `@tanstack/history`, packages plumix does not
// declare. Annotate the next binding the same way.
const ns: typeof ReactRouter = getRuntime().reactRouter;

export default ns;

export const Link: typeof ReactRouter.Link = ns.Link;
export const Outlet: typeof ReactRouter.Outlet = ns.Outlet;
export const Navigate: typeof ReactRouter.Navigate = ns.Navigate;
export const RouterProvider: typeof ReactRouter.RouterProvider =
  ns.RouterProvider;
export const Route: typeof ReactRouter.Route = ns.Route;
// Deprecated upstream in favour of the router's `scrollRestoration` option.
// Kept because dropping a binding from this shim is a breaking change to the
// published surface, which is not this lint slice's to make.
/* eslint-disable @typescript-eslint/no-deprecated -- the annotation wraps it onto two lines */
export const ScrollRestoration: typeof ReactRouter.ScrollRestoration =
  ns.ScrollRestoration;
/* eslint-enable @typescript-eslint/no-deprecated */
export const useNavigate: typeof ReactRouter.useNavigate = ns.useNavigate;
export const useRouter: typeof ReactRouter.useRouter = ns.useRouter;
export const useRouterState: typeof ReactRouter.useRouterState =
  ns.useRouterState;
export const useLocation: typeof ReactRouter.useLocation = ns.useLocation;
export const useMatch: typeof ReactRouter.useMatch = ns.useMatch;
export const useMatches: typeof ReactRouter.useMatches = ns.useMatches;
export const useChildMatches: typeof ReactRouter.useChildMatches =
  ns.useChildMatches;
export const useParentMatches: typeof ReactRouter.useParentMatches =
  ns.useParentMatches;
export const useParams: typeof ReactRouter.useParams = ns.useParams;
export const useSearch: typeof ReactRouter.useSearch = ns.useSearch;
export const useRouteContext: typeof ReactRouter.useRouteContext =
  ns.useRouteContext;
// `useBlocker` itself is current; only its two legacy call signatures carry
// `@deprecated`, and a bare re-export can't pick one, so the rule sees the
// whole symbol as deprecated.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export const useBlocker: typeof ReactRouter.useBlocker = ns.useBlocker;
export const useLoaderData: typeof ReactRouter.useLoaderData = ns.useLoaderData;
export const useLoaderDeps: typeof ReactRouter.useLoaderDeps = ns.useLoaderDeps;
export const useCanGoBack: typeof ReactRouter.useCanGoBack = ns.useCanGoBack;
export const useLinkProps: typeof ReactRouter.useLinkProps = ns.useLinkProps;
export const redirect: typeof ReactRouter.redirect = ns.redirect;
export const notFound: typeof ReactRouter.notFound = ns.notFound;
export const isRedirect: typeof ReactRouter.isRedirect = ns.isRedirect;
export const isNotFound: typeof ReactRouter.isNotFound = ns.isNotFound;
export const interpolatePath: typeof ReactRouter.interpolatePath =
  ns.interpolatePath;
export const createRouter: typeof ReactRouter.createRouter = ns.createRouter;
export const createMemoryHistory: typeof ReactRouter.createMemoryHistory =
  ns.createMemoryHistory;
export const createBrowserHistory: typeof ReactRouter.createBrowserHistory =
  ns.createBrowserHistory;
