import type { AppContext } from "../context/app.js";
import type { PublicRouteTable } from "../route/public-routes.js";
import type { DocumentManifest } from "../theme.js";
import { withBasePath } from "../base-path.js";
import { matchPublicRoute } from "../route/public-routes.js";

/**
 * Normalize a pathname to its canonical, slash-less shape. `/page/1` is the
 * same content as the bare listing, so it collapses — `/shop/page/1` → `/shop`,
 * `/page/1` → `/`. Shared by {@link canonicalUrl} and
 * {@link canonicalRedirectTarget} so the tag and the 301 can never disagree.
 */
function canonicalPath(pathname: string): string {
  const slashless = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  return slashless.replace(/\/page\/1$/, "") || "/";
}

/**
 * The single source of truth for a request's canonical URL: the configured
 * site origin + the request path normalized to the fixed slash-less shape
 * (query and fragment dropped so URL variants consolidate). Drives the
 * `<link rel="canonical">` tag and the 301 normalizer + sitemap/og:url, so
 * they can never disagree.
 */
export function canonicalUrl(ctx: AppContext): string {
  // The dispatcher already stripped any base prefix from the request, so the
  // pathname is root-relative; re-add the prefix on the way out.
  const canonical = canonicalPath(new URL(ctx.request.url).pathname);
  return `${ctx.origin}${withBasePath(canonical, ctx.basePath)}`;
}

/**
 * Paths the 301 normalizer must never touch: the root, the plumix surface, a
 * path a plugin registered as a public route, and asset/extension-like paths (a
 * dot in the last segment — covers `favicon.ico`, and `robots.txt` and
 * `sitemap*.xml` whether or not a plugin claimed them). Everything else is a
 * public page route whose shape we normalize. Core spells no SEO literal here:
 * the feeds and the robots/sitemap set are registered routes now.
 *
 * The registered-route arm restates the dispatcher's own check, which already
 * answered such a path before this ran — it is here so the exemption stays
 * true if that ordering ever moves, not for a request it decides today.
 */
export function isCanonicalExempt(
  pathname: string,
  publicRoutes: PublicRouteTable,
): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/_plumix/")) return true;
  // The literal shape, not the normalized one. Matching the normalized shape
  // exempted every trailing-slash variant of a registered endpoint — so
  // `/post/feed/` stopped 301'ing onto the feed and 404'd through the content
  // router instead, where core's own `/feed` literal only ever covered the
  // site scope. A machine endpoint consolidates its URL variants exactly like
  // a page: the 301 is what gets an aggregator to the feed.
  if (matchPublicRoute(publicRoutes, pathname) !== null) {
    return true;
  }
  const trimmed = pathname.replace(/\/+$/, "");
  const lastSegment = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}

/**
 * The canonical URL to 301-redirect this request to, or null when it's already
 * canonical or exempt. Shares {@link canonicalUrl} with the `<link rel=canonical>`
 * tag so the redirect target and the tag can never disagree; the query string
 * is preserved, and an already-canonical path returns null (loop-safe).
 */
export function canonicalRedirectTarget(
  ctx: AppContext,
  publicRoutes: PublicRouteTable,
): string | null {
  // Request path is already root-relative (base stripped at the dispatcher
  // edge), so `/` — the base prefix's own front page — is exempt as usual.
  const url = new URL(ctx.request.url);
  const target = canonicalPath(url.pathname);
  if (url.pathname === target) return null;
  if (isCanonicalExempt(url.pathname, publicRoutes)) return null;
  return `${ctx.origin}${withBasePath(target, ctx.basePath)}${url.search}`;
}

function hasCanonical(manifest: DocumentManifest): boolean {
  return manifest.link?.some((link) => link.rel === "canonical") ?? false;
}

/**
 * Gap-filler: emit `<link rel="canonical">` only when neither the template nor
 * a `render:document` subscriber already set one — so a higher layer's canonical
 * always wins and the tag never duplicates.
 */
export function applyCanonical(
  manifest: DocumentManifest,
  ctx: AppContext,
): DocumentManifest {
  if (hasCanonical(manifest)) return manifest;
  return {
    ...manifest,
    link: [
      ...(manifest.link ?? []),
      { rel: "canonical", href: canonicalUrl(ctx) },
    ],
  };
}
