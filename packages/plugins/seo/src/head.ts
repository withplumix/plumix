import type {
  DocumentManifest,
  DocumentMeta,
  OgImage,
  TemplateData,
} from "plumix";
import type { AppContext } from "plumix/plugin";
import { canonicalUrl, loadSiteSettings, pageFacts } from "plumix";

import { resolveOgImage } from "./og-image.js";
import { loadSeoSettings, nonEmpty } from "./settings.js";

const ROBOTS_INDEX = "index,follow,max-image-preview:large";
const ROBOTS_SEARCH = "noindex,follow";
const ROBOTS_PRIVATE = "noindex,nofollow";

// A private site is held out entirely; a thin search-results page is kept out
// of the index but its links are still followed.
function robotsDirective(page: {
  readonly siteIsPrivate: boolean;
  readonly noindex: boolean;
}): string {
  if (page.siteIsPrivate) return ROBOTS_PRIVATE;
  return page.noindex ? ROBOTS_SEARCH : ROBOTS_INDEX;
}

/** Everything the tag set is written from, resolved. */
export interface HeadInputs {
  readonly canonical: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly ogType: "article" | "website";
  readonly ogImage: OgImage | null;
  readonly siteName: string | null;
  readonly ogLocale: string;
  readonly noindex: boolean;
  readonly siteIsPrivate: boolean;
  /** Only ever emitted on an `article`, and only when set. */
  readonly published: Date | null;
  readonly modified: Date | null;
  readonly author: string | null;
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
 * Pure gap-filler for the head meta set: appends a `<meta>` only when its
 * `name`/`property` key is absent, so a theme- or plugin-set value always wins
 * and nothing duplicates.
 */
export function seoHeadMeta(
  manifest: DocumentManifest,
  inputs: HeadInputs,
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
  addName("robots", robotsDirective(inputs));
  // An image with no usable url is no image: every tag below hangs off it.
  const image = nonEmpty(inputs.ogImage?.url) ? inputs.ogImage : null;
  addName("twitter:card", image ? "summary_large_image" : "summary");
  addProperty("og:title", inputs.title);
  addProperty("og:type", inputs.ogType);
  addProperty("og:url", inputs.canonical);
  addProperty("og:site_name", inputs.siteName);
  addProperty("og:description", inputs.description);
  addProperty("og:locale", inputs.ogLocale);
  // Only an `article` carries them, which is the one page kind that has them.
  if (inputs.ogType === "article") {
    addProperty(
      "article:published_time",
      inputs.published?.toISOString() ?? null,
    );
    addProperty(
      "article:modified_time",
      inputs.modified?.toISOString() ?? null,
    );
    addProperty("article:author", inputs.author);
  }
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

/**
 * Write this page's head meta. Reads the site settings for the values it can't
 * derive from the page, then gap-fills via {@link seoHeadMeta}.
 */
export async function applySeoHead(
  manifest: DocumentManifest,
  data: TemplateData,
  ctx: AppContext,
  title: string,
): Promise<DocumentManifest> {
  // `loadSeoSettings` reads the `site` group too, so this pair is one query.
  const [site, seoSettings] = await Promise.all([
    loadSiteSettings(ctx),
    loadSeoSettings(ctx),
  ]);
  const { kind, entry, published, modified, author } = pageFacts(data);
  const isEntry = kind === "entry";
  return seoHeadMeta(manifest, {
    canonical: canonicalUrl(ctx),
    title: nonEmpty(title),
    description: nonEmpty(entry?.excerpt) ?? nonEmpty(site.tagline),
    ogType: isEntry ? "article" : "website",
    ogImage: await resolveOgImage(ctx, data, seoSettings.defaultOgImage),
    siteName: nonEmpty(site.title),
    ogLocale: toOgLocale(ctx.locale.code),
    // Search-results pages are thin; keep them out of the index.
    noindex: kind === "search",
    siteIsPrivate: !seoSettings.indexable,
    published,
    modified,
    // `pageFacts` also carries an author archive's author, which is not the
    // byline of anything — only an entry has one.
    author: isEntry && author ? (author.name ?? author.slug) : null,
  });
}
