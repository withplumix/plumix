import type { AppContext } from "../context/app.js";
import type { DocumentManifest } from "../theme.js";

/**
 * The single source of truth for a request's canonical URL: the configured
 * site origin + the request path normalized to the fixed slash-less shape
 * (query and fragment dropped so URL variants consolidate). Drives the
 * `<link rel="canonical">` tag now and the 301 normalizer + sitemap/og:url
 * in later slices, so they can never disagree.
 */
export function canonicalUrl(ctx: AppContext): string {
  const { pathname } = new URL(ctx.request.url);
  const slashless = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  // `/page/1` is the same content as the bare listing, so it canonicalizes to
  // the listing — `/shop/page/1` → `/shop`, `/page/1` → `/`.
  const normalized = slashless.replace(/\/page\/1$/, "");
  return `${ctx.origin}${normalized || "/"}`;
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
