import type { AppContext } from "../context/app.js";
import type { DocumentManifest, DocumentMeta, TemplateData } from "../theme.js";
import { canonicalUrl } from "./canonical.js";
import { applyFeedDiscovery } from "./feed.js";
import { loadSiteSettings, nonEmpty } from "./site-settings.js";

const ROBOTS_INDEX = "index,follow,max-image-preview:large";
const ROBOTS_SEARCH = "noindex,follow";
const ROBOTS_PRIVATE = "noindex,nofollow";

// A private site is held out entirely; a thin search-results page is kept out
// of the index but its links are still followed.
function robotsDirective(input: {
  readonly siteIsPrivate: boolean;
  readonly noindex: boolean;
}): string {
  if (input.siteIsPrivate) return ROBOTS_PRIVATE;
  return input.noindex ? ROBOTS_SEARCH : ROBOTS_INDEX;
}

interface SeoInputs {
  readonly canonical: string;
  readonly title: string | undefined;
  readonly description: string | null;
  readonly ogType: "article" | "website";
  readonly ogImage: string | null;
  readonly siteName: string | null;
  readonly ogLocale: string;
  readonly noindex: boolean;
  readonly siteIsPrivate: boolean;
}

function hasName(
  meta: readonly DocumentMeta[] | undefined,
  name: string,
): boolean {
  return meta?.some((entry) => entry.name === name) ?? false;
}

function hasProperty(
  meta: readonly DocumentMeta[] | undefined,
  property: string,
): boolean {
  return meta?.some((entry) => entry.property === property) ?? false;
}

/**
 * Pure gap-filler for the default head meta set: appends a `<meta>` only when
 * its `name`/`property` key is absent, so a template- or plugin-set value always
 * wins and nothing duplicates.
 */
export function seoHeadDefaults(
  manifest: DocumentManifest,
  inputs: SeoInputs,
): DocumentManifest {
  const existing = manifest.meta;
  const additions: DocumentMeta[] = [];
  const addName = (name: string, content: string | null): void => {
    if (content && !hasName(existing, name)) additions.push({ name, content });
  };
  const addProperty = (property: string, content: string | null): void => {
    if (content && !hasProperty(existing, property)) {
      additions.push({ property, content });
    }
  };

  addName("description", inputs.description);
  addName(
    "robots",
    robotsDirective({
      siteIsPrivate: inputs.siteIsPrivate,
      noindex: inputs.noindex,
    }),
  );
  addName("twitter:card", inputs.ogImage ? "summary_large_image" : "summary");
  addProperty("og:title", inputs.title ?? null);
  addProperty("og:type", inputs.ogType);
  addProperty("og:url", inputs.canonical);
  addProperty("og:site_name", inputs.siteName);
  addProperty("og:description", inputs.description);
  addProperty("og:locale", inputs.ogLocale);
  addProperty("og:image", inputs.ogImage);

  if (additions.length === 0) return manifest;
  return { ...manifest, meta: [...(existing ?? []), ...additions] };
}

// `og:locale` wants `lang_TERRITORY`; the active locale code is `lang-TERRITORY`.
function toOgLocale(localeCode: string): string {
  return localeCode.replace("-", "_");
}

/**
 * Fill the default head meta for a request. Reads the site settings (title,
 * tagline, default OG image) for the values it can't derive from the page, then
 * gap-fills via {@link seoHeadDefaults}.
 */
export async function applyHeadMeta(
  manifest: DocumentManifest,
  data: TemplateData,
  ctx: AppContext,
  title: string | undefined,
): Promise<DocumentManifest> {
  const site = await loadSiteSettings(ctx);
  const siteIsPrivate = site.public === false;
  const excerpt = "entry" in data ? nonEmpty(data.entry.excerpt) : null;
  const description = excerpt ?? nonEmpty(site.tagline);
  const withMeta = seoHeadDefaults(manifest, {
    canonical: canonicalUrl(ctx),
    title,
    description,
    ogType: "entry" in data ? "article" : "website",
    ogImage: nonEmpty(site.default_og_image),
    siteName: nonEmpty(site.title),
    ogLocale: toOgLocale(ctx.locale.code),
    // Search-results pages are thin; keep them out of the index.
    noindex: "query" in data,
    siteIsPrivate,
  });
  return applyFeedDiscovery(withMeta, data, ctx, { siteIsPrivate });
}
