import type { AppContext } from "../context/app-context.js";
import type { DocumentManifest } from "../document-manifest.js";
import type { PublicRouteTableFor } from "../route/contract/public-route-table.js";
import { withBasePath } from "../base-path.js";
import { matchPublicRoute } from "../route/contract/public-route-table.js";

type CanonicalContext = Pick<AppContext, "request" | "origin" | "config">;

/**
 * `/page/1` is the bare listing. Shared so the tag and the 301 never disagree.
 */
function canonicalPath(pathname: string): string {
  const slashless = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  return slashless.replace(/\/page\/1$/, "") || "/";
}

/** Drops query and fragment so URL variants consolidate. */
export function canonicalUrl(ctx: CanonicalContext): string {
  // The dispatcher already stripped any base prefix from the request, so the
  // pathname is root-relative; re-add the prefix on the way out.
  const canonical = canonicalPath(new URL(ctx.request.url).pathname);
  return `${ctx.origin}${withBasePath(canonical, ctx.config.basePath)}`;
}

/**
 * Exempts the root, the plumix surface, registered public routes and
 * dot-suffixed asset paths. The registered-route arm guards against dispatch
 * order moving.
 */
export function isCanonicalExempt(
  pathname: string,
  publicRoutes: PublicRouteTableFor<unknown>,
): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/_plumix/")) return true;
  // The literal shape, not normalized: a feed's trailing-slash variant must
  // still 301 onto the feed.
  if (matchPublicRoute(publicRoutes, pathname) !== null) {
    return true;
  }
  const trimmed = pathname.replace(/\/+$/, "");
  const lastSegment = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}

/**
 * Null when already canonical or exempt, so it is loop-safe. Keeps the query
 * string.
 */
export function canonicalRedirectTarget(
  ctx: CanonicalContext,
  publicRoutes: PublicRouteTableFor<unknown>,
): string | null {
  // Request path is already root-relative (base stripped at the dispatcher
  // edge), so `/` — the base prefix's own front page — is exempt as usual.
  const url = new URL(ctx.request.url);
  const target = canonicalPath(url.pathname);
  if (url.pathname === target) return null;
  if (isCanonicalExempt(url.pathname, publicRoutes)) return null;
  return `${ctx.origin}${withBasePath(target, ctx.config.basePath)}${url.search}`;
}

function hasCanonical(manifest: DocumentManifest): boolean {
  return manifest.link?.some((link) => link.rel === "canonical") ?? false;
}

/**
 * Only when neither the template nor a `render:document` subscriber set one,
 * and not for `canonical: false`.
 */
export function applyCanonical(
  manifest: DocumentManifest,
  ctx: AppContext,
): DocumentManifest {
  if (manifest.canonical === false || hasCanonical(manifest)) return manifest;
  return {
    ...manifest,
    link: [
      ...(manifest.link ?? []),
      { rel: "canonical", href: canonicalUrl(ctx) },
    ],
  };
}
