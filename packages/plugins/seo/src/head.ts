import type {
  DocumentLink,
  DocumentManifest,
  DocumentMeta,
  DocumentScript,
  TemplateData,
} from "plumix";
import type { AppContext, OgImage } from "plumix/plugin";
import { canonicalUrl, loadSiteSettings, pageFacts } from "plumix/plugin";

import type { VerificationTag } from "./settings.js";
import { breadcrumbTrail, siteRoot } from "./breadcrumbs.js";
import { indexable } from "./indexable.js";
import { resolveOgImage } from "./og-image.js";
import { readPageOverrides } from "./overrides.js";
import { patternTitle } from "./page-title.js";
import { DEFAULT_SCHEMA_TYPE, schemaGraph, schemaScript } from "./schema.js";
import { loadSeoSettings, loadVerificationTags, nonEmpty } from "./settings.js";

// `composeTitle` substitutes `%s`, so this is the template that changes
// nothing.
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
   * Outranks {@link title}, and is the only title written to `<title>`, so
   * pages without one keep going through the theme's `titleTemplate`.
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
  /** Whether to write the `article:*` tags at all; a site can turn them off. */
  readonly articleTags: boolean;
  /** A page that resolved to nothing: it carries the robots directive alone. */
  readonly errorPage: boolean;
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

function declaredCanonical(
  link: readonly DocumentLink[] | undefined,
): string | null {
  const href = link?.find((entry) => entry.rel === "canonical")?.href;
  return nonEmpty(href);
}

function derivedCanonical(
  manifest: DocumentManifest,
  ctx: AppContext,
): string | null {
  if (manifest.canonical === false) return declaredCanonical(manifest.link);
  return canonicalUrl(ctx);
}

/**
 * Appends only what is absent, so a theme- or plugin-set value always wins. An
 * error page gets the robots directive and nothing else.
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

  // A URL that resolved to nothing has no page to describe or share and no
  // site to vouch for, so all it says is whether to index it.
  if (inputs.errorPage) {
    addName("robots", robotsDirective(inputs));
    return withAdditions(manifest, inputs, additions);
  }

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
  if (inputs.articleTags && inputs.ogType === "article") {
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
  // The image tags travel as a group: a size or twitter mirror beside a
  // template's own `og:image` would describe some other image.
  if (image && !hasProperty(existing, "og:image")) {
    addProperty("og:image", image.url);
    addProperty("og:image:width", image.width?.toString() ?? null);
    addProperty("og:image:height", image.height?.toString() ?? null);
    addName("twitter:image", image.url);
    const alt = nonEmpty(image.alt);
    addProperty("og:image:alt", alt);
    addName("twitter:image:alt", alt);
  }

  return withAdditions(manifest, inputs, additions);
}

function withAdditions(
  manifest: DocumentManifest,
  inputs: HeadInputs,
  additions: readonly DocumentMeta[],
): DocumentManifest {
  // Written here because core's gap-filler runs after this and would otherwise
  // declare the derived URL an editor overrode.
  const canonical = inputs.canonical;
  const link =
    canonical === null || hasCanonical(manifest.link)
      ? manifest.link
      : [
          ...(manifest.link ?? []),
          { rel: "canonical", href: canonical } satisfies DocumentLink,
        ];

  // Ships verbatim: a composed title is the whole line, not a fragment for a
  // theme's `titleTemplate` to finish.
  const composed = manifest.title === undefined ? inputs.searchTitle : null;
  return {
    ...manifest,
    ...(composed === null
      ? {}
      : { title: composed, titleTemplate: IDENTITY_TEMPLATE }),
    link,
    meta: [...(manifest.meta ?? []), ...additions],
  };
}

// `og:locale` wants `lang_TERRITORY`; the active locale code is
// `lang-TERRITORY`.
function toOgLocale(localeCode: string): string {
  return localeCode.replace("-", "_");
}

// A theme that wrote its own `ld+json` has described the page; a second graph
// would make two claims about it.
function hasJsonLd(scripts: readonly DocumentScript[] | undefined): boolean {
  // Lowercased: an HTML `type` attribute is case-insensitive, so a theme that
  // wrote `application/LD+JSON` has still claimed the page.
  return (
    scripts?.some(
      (entry) => entry.type?.toLowerCase() === "application/ld+json",
    ) ?? false
  );
}

/** What the site turned off when it installed the plugin. */
export interface SeoHeadOptions {
  readonly articleTags: boolean;
  readonly structuredData: boolean;
  /** The views the site offers to search engines (`indexViews`). */
  readonly indexViews: ReadonlySet<string>;
}

/**
 * An error page gets the robots directive alone; `options.structuredData:
 * false` skips the graph and its `seo:schema:*` filters.
 */
export async function applySeoHead(
  manifest: DocumentManifest,
  data: TemplateData,
  ctx: AppContext,
  title: string,
  options: SeoHeadOptions,
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
  const decision = indexable(facts, seoSettings, {
    indexViews: options.indexViews,
  });
  const siteName = nonEmpty(site.title);
  // An error page is the canonical address of nothing. A page with
  // `canonical: false` gets only one it declared, or an editor's override.
  const canonical =
    kind === "error"
      ? null
      : (overrides.canonical ?? derivedCanonical(manifest, ctx));
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
    articleTags: options.articleTags,
    errorPage: kind === "error",
    verification,
  });

  // A noindex page gets no graph, so its graph and robots directive never
  // disagree.
  if (
    !options.structuredData ||
    kind === "error" ||
    !decision.indexable ||
    hasJsonLd(manifest.script)
  ) {
    return withMeta;
  }

  const graph = await schemaGraph(ctx, facts, {
    // A page that opted out of its canonical still needs identifiers, so they
    // hang off the request's own address; it just claims no `url` with them.
    canonical: canonical ?? canonicalUrl(ctx),
    url: canonical,
    home: siteRoot(ctx),
    title: searchTitle ?? nonEmpty(title),
    description,
    siteName,
    siteDescription: tagline,
    locale: ctx.locale.code,
    // The site default is a sharing fallback; passed on, every article would
    // claim it as its own `#primaryimage`.
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
