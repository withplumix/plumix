import type {
  DocumentLink,
  DocumentManifest,
  DocumentMeta,
  OgImage,
  TemplateData,
} from "plumix";
import type { AppContext } from "plumix/plugin";
import { canonicalUrl, loadSiteSettings, pageFacts } from "plumix";

import { indexable } from "./indexable.js";
import { resolveOgImage } from "./og-image.js";
import { readPageOverrides } from "./overrides.js";
import { loadSeoSettings, nonEmpty } from "./settings.js";

// `max-image-preview` is an indexing hint, so it rides only on the arm that
// asks to be indexed; `nofollow` is a separate answer from `noindex` and can
// pair with either.
function robotsDirective(page: {
  readonly indexable: boolean;
  readonly nofollow: boolean;
}): string {
  const follow = page.nofollow ? "nofollow" : "follow";
  return page.indexable
    ? `index,${follow},max-image-preview:large`
    : `noindex,${follow}`;
}

/** Everything the tag set is written from, resolved. */
export interface HeadInputs {
  /** An editor's canonical override, else the one core derived. */
  readonly canonical: string;
  /** The title core resolved for the page. */
  readonly title: string | null;
  /**
   * The editor's search title, which outranks {@link title} everywhere it is
   * set. Only it reaches `<title>` — writing the resolved title there would
   * put every page through a `titleTemplate` it does not go through today.
   */
  readonly searchTitle: string | null;
  readonly description: string | null;
  readonly ogType: "article" | "website";
  readonly ogImage: OgImage | null;
  readonly siteName: string | null;
  readonly ogLocale: string;
  readonly indexable: boolean;
  readonly nofollow: boolean;
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

function hasCanonical(link: readonly DocumentLink[] | undefined): boolean {
  return link?.some((entry) => entry.rel === "canonical") ?? false;
}

/**
 * Pure gap-filler for the head: appends a `<meta>` only when its
 * `name`/`property` key is absent, a `<link rel=canonical>` only when nothing
 * declared one, and a `<title>` only when an editor overrode it — so a theme-
 * or plugin-set value always wins and nothing duplicates.
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
  addProperty("og:title", inputs.searchTitle ?? inputs.title);
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

  // Written here rather than left to core's own gap-filler, which runs after
  // this and would otherwise declare the derived URL an editor overrode. With
  // no override the two agree, so core simply finds the tag already set.
  const link = hasCanonical(manifest.link)
    ? manifest.link
    : [
        ...(manifest.link ?? []),
        { rel: "canonical", href: inputs.canonical } satisfies DocumentLink,
      ];

  return {
    ...manifest,
    // Only an override reaches `<title>`. A page with none goes on being
    // titled the way core titles it.
    title: manifest.title ?? inputs.searchTitle ?? undefined,
    link,
    meta: [...(existing ?? []), ...additions],
  };
}

// `og:locale` wants `lang_TERRITORY`; the active locale code is `lang-TERRITORY`.
function toOgLocale(localeCode: string): string {
  return localeCode.replace("-", "_");
}

/**
 * Write this page's head. Reads the site settings and the subject's own SEO
 * answers, decides indexability once through {@link indexable}, then gap-fills
 * via {@link seoHeadMeta}.
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
  const facts = pageFacts(data);
  const { kind, entry, published, modified, author } = facts;
  const isEntry = kind === "entry";
  const overrides = readPageOverrides(facts);
  const decision = indexable(facts, seoSettings);
  return seoHeadMeta(manifest, {
    canonical: overrides.canonical ?? canonicalUrl(ctx),
    title: nonEmpty(title),
    searchTitle: overrides.title,
    description:
      overrides.description ??
      nonEmpty(entry?.excerpt) ??
      nonEmpty(site.tagline),
    ogType: isEntry ? "article" : "website",
    ogImage: await resolveOgImage(ctx, data, {
      override: overrides.ogImage,
      siteDefault: seoSettings.defaultOgImage,
    }),
    siteName: nonEmpty(site.title),
    ogLocale: toOgLocale(ctx.locale.code),
    indexable: decision.indexable,
    // A site held out of the index is held out of search entirely, links
    // included; anywhere else `nofollow` is the editor's own separate answer.
    nofollow: !seoSettings.indexable || overrides.nofollow,
    published,
    modified,
    // `pageFacts` also carries an author archive's author, which is not the
    // byline of anything — only an entry has one.
    author: isEntry && author ? (author.name ?? author.slug) : null,
  });
}
