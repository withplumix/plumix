import type {
  DocumentLink,
  DocumentManifest,
  DocumentMeta,
  DocumentScript,
  OgImage,
  TemplateData,
} from "plumix";
import type { AppContext } from "plumix/plugin";
import { canonicalUrl, loadSiteSettings, pageFacts } from "plumix";

import type { VerificationTag } from "./settings.js";
import { breadcrumbTrail, siteRoot } from "./breadcrumbs.js";
import { indexable } from "./indexable.js";
import { resolveOgImage } from "./og-image.js";
import { readPageOverrides } from "./overrides.js";
import { patternTitle } from "./page-title.js";
import { DEFAULT_SCHEMA_TYPE, schemaGraph, schemaScript } from "./schema.js";
import { loadSeoSettings, loadVerificationTags, nonEmpty } from "./settings.js";

// `composeTitle` substitutes `%s`, so this is the template that changes nothing.
const IDENTITY_TEMPLATE = "%s";

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
  /**
   * An editor's canonical override, else the one core derived — and null on a
   * page that is the canonical address of nothing.
   */
  readonly canonical: string | null;
  /** The title core resolved for the page. */
  readonly title: string | null;
  /**
   * The title this plugin composed — an editor's search title, else the
   * site's own pattern for this page. Outranks {@link title} everywhere it is
   * set, and is the only thing that reaches `<title>`: writing the resolved
   * title there would put every page through a theme's `titleTemplate` that
   * it does not go through today.
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
  /** One entry per engine the site owner configured. */
  readonly verification: readonly VerificationTag[];
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
  // Ownership proofs, not page copy — each engine reads its own name, and a
  // theme that already declared one keeps it like any other tag.
  for (const tag of inputs.verification) addName(tag.name, tag.content);
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
  const canonical = inputs.canonical;
  const link =
    canonical === null || hasCanonical(manifest.link)
      ? manifest.link
      : [
          ...(manifest.link ?? []),
          { rel: "canonical", href: canonical } satisfies DocumentLink,
        ];

  // Only a composed title reaches `<title>`, and it ships verbatim: a search
  // title or a site's own pattern is the whole line, not a fragment for a
  // theme's `titleTemplate` to finish. A page with none — or one whose theme
  // set its own — goes on being titled the way core titles it.
  const composed = manifest.title === undefined ? inputs.searchTitle : null;
  return {
    ...manifest,
    ...(composed === null
      ? {}
      : { title: composed, titleTemplate: IDENTITY_TEMPLATE }),
    link,
    meta: [...(existing ?? []), ...additions],
  };
}

// `og:locale` wants `lang_TERRITORY`; the active locale code is `lang-TERRITORY`.
function toOgLocale(localeCode: string): string {
  return localeCode.replace("-", "_");
}

// The graph goes with the tags rather than beside them: a theme that wrote its
// own `ld+json` has said what the page is, and a second script would have the
// page make two claims about itself.
function hasJsonLd(scripts: readonly DocumentScript[] | undefined): boolean {
  // Lowercased: an HTML `type` attribute is case-insensitive, so a theme that
  // wrote `application/LD+JSON` has still claimed the page.
  return (
    scripts?.some(
      (entry) => entry.type?.toLowerCase() === "application/ld+json",
    ) ?? false
  );
}

/**
 * Write this page's head. Reads the site settings and the subject's own SEO
 * answers, decides indexability once through {@link indexable}, then gap-fills
 * via {@link seoHeadMeta} and appends the structured-data graph.
 */
export async function applySeoHead(
  manifest: DocumentManifest,
  data: TemplateData,
  ctx: AppContext,
  title: string,
): Promise<DocumentManifest> {
  // `loadSeoSettings` reads the `site` group too, so this pair is one query.
  const [site, seoSettings, verification] = await Promise.all([
    loadSiteSettings(ctx),
    loadSeoSettings(ctx),
    loadVerificationTags(ctx),
  ]);
  const facts = pageFacts(data);
  const { kind, entry, published, modified, author } = facts;
  const isEntry = kind === "entry";
  const overrides = readPageOverrides(facts);
  const decision = indexable(facts, seoSettings);
  const siteName = nonEmpty(site.title);
  // A URL that resolved to nothing is the canonical address of nothing, and
  // core deliberately leaves an error page's canonical unwritten for the same
  // reason — so neither the tag nor `og:url` is claimed there.
  const canonical =
    kind === "error" ? null : (overrides.canonical ?? canonicalUrl(ctx));
  const tagline = nonEmpty(site.tagline);
  const description =
    overrides.description ?? nonEmpty(entry?.excerpt) ?? tagline;
  // The editor's search title, else the site's own pattern for this page.
  const searchTitle =
    overrides.title ??
    patternTitle(seoSettings, {
      facts,
      data,
      title,
      siteName,
      localeCode: ctx.locale.code,
    });
  // `pageFacts` also carries an author archive's author, which is not the
  // byline of anything — only an entry has one.
  const byline = isEntry && author ? author : null;
  const ogImage = await resolveOgImage(ctx, data, {
    override: overrides.ogImage,
    siteDefault: seoSettings.defaultOgImage,
  });
  const withMeta = seoHeadMeta(manifest, {
    canonical,
    title: nonEmpty(title),
    searchTitle,
    description,
    ogType: isEntry ? "article" : "website",
    ogImage,
    siteName,
    ogLocale: toOgLocale(ctx.locale.code),
    indexable: decision.indexable,
    // A site held out of the index is held out of search entirely, links
    // included; anywhere else `nofollow` is the editor's own separate answer.
    nofollow: !seoSettings.indexable || overrides.nofollow,
    published,
    modified,
    author: byline ? (byline.name ?? byline.slug) : null,
    verification,
  });

  // A page asking not to be indexed has no rich result to be eligible for, so
  // it offers no structured data — the alternative is a page whose graph and
  // whose robots directive say different things about it. Nor does a URL that
  // resolved to nothing, which has no subject to describe and no canonical to
  // hang one off.
  if (canonical === null || !decision.indexable || hasJsonLd(manifest.script)) {
    return withMeta;
  }

  const graph = await schemaGraph(ctx, facts, {
    canonical,
    home: siteRoot(ctx),
    title: searchTitle ?? nonEmpty(title),
    description,
    siteName,
    siteDescription: tagline,
    locale: ctx.locale.code,
    // The last link of the `og:image` chain is a sharing fallback, not a
    // picture of this page. Passed on, every article on the site would claim
    // the same bytes as its own `#primaryimage`, and `Article.image` is read
    // as representative of the article it hangs off.
    image: ogImage?.url === seoSettings.defaultOgImage ? null : ogImage,
    published,
    modified,
    author: byline
      ? { slug: byline.slug, name: byline.name ?? byline.slug }
      : null,
    articleType: isEntry ? (overrides.schemaType ?? DEFAULT_SCHEMA_TYPE) : null,
    represents: seoSettings.represents,
    breadcrumbs: breadcrumbTrail(ctx, data),
  });
  // A subscriber that emptied the graph asked for no script.
  if (graph.length === 0) return withMeta;
  return {
    ...withMeta,
    script: [...(withMeta.script ?? []), schemaScript(graph)],
  };
}
