import { getRuntime } from "./runtime.js";

const ns = getRuntime().reactRouter;

export default ns;

export const Link = ns.Link;
export const Outlet = ns.Outlet;
export const Navigate = ns.Navigate;
export const RouterProvider = ns.RouterProvider;
export const Route = ns.Route;
// Deprecated upstream in favour of the router's `scrollRestoration` option.
// Kept because dropping a binding from this shim is a breaking change to the
// published surface, which is not this lint slice's to make.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export const ScrollRestoration = ns.ScrollRestoration;
export const useNavigate = ns.useNavigate;
export const useRouter = ns.useRouter;
export const useRouterState = ns.useRouterState;
export const useLocation = ns.useLocation;
export const useMatch = ns.useMatch;
export const useMatches = ns.useMatches;
export const useChildMatches = ns.useChildMatches;
export const useParentMatches = ns.useParentMatches;
export const useParams = ns.useParams;
export const useSearch = ns.useSearch;
export const useRouteContext = ns.useRouteContext;
// `useBlocker` itself is current; only its two legacy call signatures carry
// `@deprecated`, and a bare re-export can't pick one, so the rule sees the
// whole symbol as deprecated.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export const useBlocker = ns.useBlocker;
export const useLoaderData = ns.useLoaderData;
export const useLoaderDeps = ns.useLoaderDeps;
export const useCanGoBack = ns.useCanGoBack;
export const useLinkProps = ns.useLinkProps;
export const redirect = ns.redirect;
export const notFound = ns.notFound;
export const isRedirect = ns.isRedirect;
export const isNotFound = ns.isNotFound;
export const interpolatePath = ns.interpolatePath;
export const createRouter = ns.createRouter;
export const createMemoryHistory = ns.createMemoryHistory;
export const createBrowserHistory = ns.createBrowserHistory;
