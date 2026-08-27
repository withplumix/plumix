import type { AppContext } from "../context/app.js";
import type { MetaBoxField, PluginRegistry } from "../plugin/manifest.js";
import type { ResolvedMeta } from "../rpc/meta/core.js";
import type { DocumentManifest, DocumentMeta, TemplateData } from "../theme.js";
import { listEntryMetaFields } from "../plugin/manifest.js";
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

/**
 * A page's resolved social image. `width`/`height` are absent when the image's
 * size isn't known.
 */
export interface OgImage {
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
}

interface SeoInputs {
  readonly canonical: string;
  readonly title: string | undefined;
  readonly description: string | null;
  readonly ogType: "article" | "website";
  readonly ogImage: OgImage | null;
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
  // An image with no usable url is no image: every tag below hangs off it.
  const image = nonEmpty(inputs.ogImage?.url) ? inputs.ogImage : null;
  addName("twitter:card", image ? "summary_large_image" : "summary");
  addProperty("og:title", inputs.title ?? null);
  addProperty("og:type", inputs.ogType);
  addProperty("og:url", inputs.canonical);
  addProperty("og:site_name", inputs.siteName);
  addProperty("og:description", inputs.description);
  addProperty("og:locale", inputs.ogLocale);
  // The image tags describe one picture, so they travel as a group: a template
  // that declared its own `og:image` owns it, and a size or twitter mirror
  // appended beside it would describe some other image.
  if (image && !hasProperty(existing, "og:image")) {
    addProperty("og:image", image.url);
    addProperty("og:image:width", image.width?.toString() ?? null);
    addProperty("og:image:height", image.height?.toString() ?? null);
    addName("twitter:image", image.url);
  }

  if (additions.length === 0) return manifest;
  return { ...manifest, meta: [...(existing ?? []), ...additions] };
}

// `og:locale` wants `lang_TERRITORY`; the active locale code is `lang-TERRITORY`.
function toOgLocale(localeCode: string): string {
  return localeCode.replace("-", "_");
}

// A hydrated media reference exposes a string `url` and the row's measured
// `width`/`height` (null until something measures them); an orphaned single
// reference hydrates to null. Read structurally — core can't import the media
// plugin's `MediaReference` type.
function mediaImage(value: unknown): OgImage | null {
  if (value === null || typeof value !== "object" || !("url" in value)) {
    return null;
  }
  const url = nonEmpty(value.url);
  if (!url) return null;
  const width = measured("width" in value ? value.width : null);
  const height = measured("height" in value ? value.height : null);
  // The size travels as a pair or not at all: one axis alone tells a scraper
  // nothing it can lay out with.
  return width !== null && height !== null ? { url, width, height } : { url };
}

// The parse `mediaImage`'s structural read defers, `nonEmpty`'s sibling for the
// axes: a media row carries null on both until something measures it.
function measured(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** The semantic role a media field plays for its entry. */
type MediaFieldRole = NonNullable<MetaBoxField["role"]>;

/**
 * Resolve one role's image from an entry's role-tagged media fields. Reads the
 * hydrated `entry.meta` value structurally, so an orphaned reference (null) or
 * a value with no usable url falls through to the next field of the same role.
 * Returns null when nothing resolves, handing the rest of the chain to
 * {@link resolveOgImage}.
 */
export function resolveEntryRoleImage(
  fields: readonly MetaBoxField[],
  meta: ResolvedMeta,
  role: MediaFieldRole,
): OgImage | null {
  for (const field of fields) {
    if (field.role !== role) continue;
    const image = mediaImage(meta[field.key]);
    if (image) return image;
  }
  return null;
}

// Scopes the role walk to the entry's own content-type fields; null for any
// page that is not a single entry.
function entryRoleImage(
  plugins: PluginRegistry,
  data: TemplateData,
  role: MediaFieldRole,
): OgImage | null {
  if (data.kind !== "entry") return null;
  return resolveEntryRoleImage(
    listEntryMetaFields(plugins, data.entry.type),
    data.entry.meta,
    role,
  );
}

declare module "../hooks/types.js" {
  interface FilterRegistry {
    /**
     * Supply the page's `og:image`. Sits below an author's explicit
     * `.ogImage()` role — which short-circuits before this runs, so a
     * deliberate choice is never overridden — and above the entry's
     * `.featured()` photo and the site-wide default.
     *
     * Returning null, the value handed in, leaves the chain alone: the photo
     * is used, then the site default. Returning an image outranks both, so a
     * subscriber that only handles some pages must pass the value through on
     * the rest rather than answer for them.
     *
     * `featured` is that photo, passed alongside rather than as the value, so
     * a subscriber can improve on it — crop it to a social card's shape, say —
     * instead of only replacing it, and so that declining stays free.
     */
    "seo:og_image": (
      image: OgImage | null,
      data: TemplateData,
      ctx: AppContext,
      featured: OgImage | null,
    ) => OgImage | null | Promise<OgImage | null>;
  }
}

/** The `og:image` for a request, resolved down the chain. */
export async function resolveOgImage(
  ctx: AppContext,
  data: TemplateData,
  siteDefault: string | null,
): Promise<OgImage | null> {
  const explicit = entryRoleImage(ctx.plugins, data, "ogImage");
  if (explicit) return explicit;
  const featured = entryRoleImage(ctx.plugins, data, "featured");
  const filtered = await ctx.hooks.applyFilter(
    "seo:og_image",
    null,
    data,
    ctx,
    featured,
  );
  return filtered ?? featured ?? (siteDefault ? { url: siteDefault } : null);
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
    ogImage: await resolveOgImage(ctx, data, nonEmpty(site.default_og_image)),
    siteName: nonEmpty(site.title),
    ogLocale: toOgLocale(ctx.locale.code),
    // Search-results pages are thin; keep them out of the index.
    noindex: data.kind === "search",
    siteIsPrivate,
  });
  return applyFeedDiscovery(withMeta, data, ctx, { siteIsPrivate });
}
