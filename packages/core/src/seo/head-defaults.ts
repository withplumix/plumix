import type { AppContext } from "../context/app.js";
import type { MetaBoxField } from "../plugin/manifest.js";
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

// A hydrated media reference exposes a string `url`; an orphaned single
// reference hydrates to null. Read structurally — core can't import the media
// plugin's `MediaReference` type.
function mediaUrl(value: unknown): string | null {
  if (value !== null && typeof value === "object" && "url" in value) {
    return nonEmpty((value as { url: unknown }).url);
  }
  return null;
}

/**
 * Resolve an entry's `og:image` from its role-tagged media fields: an explicit
 * `.ogImage()` override outranks the `.featured()` image. Reads the hydrated
 * `entry.meta` value structurally, so an orphaned reference (null) or a value
 * with no usable url falls through. Returns null when nothing resolves, leaving
 * the caller to fall back to the site-wide default.
 */
export function resolveEntryOgImage(
  fields: readonly MetaBoxField[],
  meta: Record<string, unknown>,
): string | null {
  for (const role of ["ogImage", "featured"] as const) {
    for (const field of fields) {
      if (field.role !== role) continue;
      const url = mediaUrl(meta[field.key]);
      if (url) return url;
    }
  }
  return null;
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
  // Discriminate on `kind`, not duck-typed field presence — a plugin archive's
  // (`CustomArchiveData`) payload is arbitrary and could carry an `entry` or
  // `query` field that a `"… in data"` check would misread.
  const excerpt = data.kind === "entry" ? nonEmpty(data.entry.excerpt) : null;
  const description = excerpt ?? nonEmpty(site.tagline);
  const withMeta = seoHeadDefaults(manifest, {
    canonical: canonicalUrl(ctx),
    title,
    description,
    ogType: data.kind === "entry" ? "article" : "website",
    ogImage: nonEmpty(site.default_og_image),
    siteName: nonEmpty(site.title),
    ogLocale: toOgLocale(ctx.locale.code),
    // Search-results pages are thin; keep them out of the index.
    noindex: data.kind === "search",
    siteIsPrivate,
  });
  return applyFeedDiscovery(withMeta, data, ctx, { siteIsPrivate });
}
