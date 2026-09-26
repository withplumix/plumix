import type { AppContext } from "../context/app.js";
import type { RouteIntent, RouteRule } from "./intent.js";
import type { RouteMatch } from "./match.js";
import type { PublicRouteMatch, PublicRouteTable } from "./public-routes.js";
import type { CompiledRedirects, RedirectResolution } from "./redirects.js";
import type { RenderEnv } from "./render/render-env.js";
import {
  gone,
  methodNotAllowed,
  notFound,
  permanentRedirect,
  redirect,
} from "../runtime/http.js";
import { canonicalRedirectTarget } from "../seo/canonical.js";
import { matchRoute } from "./match.js";
import { matchPublicRoute } from "./public-routes.js";
import { matchRedirect } from "./redirects.js";
import { resolvePublicRoute } from "./resolve.js";

export type { PublicRouteMatch } from "./public-routes.js";
export { renderErrorThroughTheme } from "./render/render-template.js";

interface PublicRouting {
  readonly publicRoutes: PublicRouteTable;
  readonly redirects: CompiledRedirects;
  readonly routeMap: readonly RouteRule[];
  readonly renderEnv: RenderEnv;
}

export type PublicRouteOutcome =
  | { readonly kind: "response"; readonly response: Response }
  // Served by the caller, which owns the CDN terms a public route opts into.
  | { readonly kind: "public-route"; readonly route: PublicRouteMatch }
  | ContentRoute;

// A request the content route map decides. `match` is what the map matched;
// `intent` and `render` also cover an unmatched root, which is the front page.
export interface ContentRoute {
  readonly kind: "content";
  readonly match: RouteMatch | null;
  readonly intent: RouteIntent | null;
  readonly render: (ctx: AppContext) => Promise<Response>;
}

type RoutingContext = Pick<AppContext, "request" | "origin" | "basePath">;

/**
 * Route a public request through the route unit's stages, in their fixed
 * order: method check → public route → redirect → static-asset 404 →
 * canonical 301 → content route map. The first stage that answers wins, so a
 * plugin's `/robots.txt` can't be shadowed by a redirect, a moved asset can
 * still redirect, and a redirect shadows a would-be page.
 */
export function routePublicRequest(
  routing: PublicRouting,
  ctx: RoutingContext,
  url: URL,
): PublicRouteOutcome {
  const { method } = ctx.request;
  if (method !== "GET" && method !== "HEAD") {
    return { kind: "response", response: methodNotAllowed(["GET", "HEAD"]) };
  }

  const publicRoute = matchPublicRoute(routing.publicRoutes, url.pathname);
  if (publicRoute !== null) return { kind: "public-route", route: publicRoute };

  const resolution = matchRedirect(url, routing.redirects);
  if (resolution !== null) {
    return { kind: "response", response: redirectResponse(resolution) };
  }

  if (STATIC_ASSET_EXT.test(url.pathname)) {
    return {
      kind: "response",
      response: cacheableAssetNotFound("static-asset"),
    };
  }

  const canonical = canonicalRedirectTarget(ctx, routing.publicRoutes);
  if (canonical !== null) {
    return { kind: "response", response: permanentRedirect(canonical) };
  }

  const match = matchRoute(url, routing.routeMap);
  const resolved = match ?? unmatchedFallback(url);
  return {
    kind: "content",
    match,
    intent: resolved?.intent ?? null,
    render: (renderCtx) =>
      resolved === null
        ? Promise.resolve(notFound("public-route-not-found"))
        : resolvePublicRoute(renderCtx, resolved, routing.renderEnv),
  };
}

// An unmatched root is the front page; any other unmatched URL is a 404.
function unmatchedFallback(url: URL): RouteMatch | null {
  if (url.pathname !== "/") return null;
  return { intent: { kind: "front-page" }, pattern: "/", params: {} };
}

// Extensions that only ever name static assets (favicon.ico, hashed chunks,
// images, fonts). Slugs are slug-shaped by schema — never contain dots — so no
// entry or term URL can collide (#1491). Deliberately excludes
// content-plausible extensions (`.txt`, `.xml`, `.json`, `.html`) so routes
// like an `ads.txt` or podcast-feed plugin keep working.
export const STATIC_ASSET_EXT =
  /\.(?:ico|css|js|mjs|map|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf|eot|wasm)$/i;

// Cacheable because the extension check makes the path permanently
// unroutable — a short TTL only bounds "a deploy added this asset". The
// CDN stores GET+200 only, so this reaches browsers/CDNs, not the
// shared read-through layer.
export function cacheableAssetNotFound(hint: string): Response {
  const response = notFound(hint);
  response.headers.set("cache-control", "public, max-age=300");
  return response;
}

function redirectResponse(resolution: RedirectResolution): Response {
  return resolution.kind === "gone"
    ? gone("redirect-gone")
    : redirect(resolution.location, resolution.status);
}
