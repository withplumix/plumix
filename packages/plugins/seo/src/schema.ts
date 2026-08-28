import type {
  DocumentScript,
  JsonObject,
  JsonValue,
  OgImage,
  PageFacts,
} from "plumix";
import type { AppContext } from "plumix/plugin";

import type { BreadcrumbItem } from "./breadcrumbs.js";
import type { SiteRepresents } from "./settings.js";
import { serializeJsonLd } from "./json-ld.js";

/**
 * One node of the graph. `@id` is what makes it addressable: every other piece
 * that mentions it does so as `{ "@id": … }` rather than repeating its body,
 * which is what makes this a graph instead of a pile of disconnected objects.
 */
export interface SchemaPiece extends JsonObject {
  readonly "@type": string;
  readonly "@id": string;
}

/**
 * The pieces this plugin builds, named by the role they play rather than by
 * their schema.org type — `publisher` is an `Organization` or a `Person`
 * depending on what the site says it represents, and the filters below key off
 * the role, which does not move.
 */
export type SchemaPieceName =
  | "website"
  | "publisher"
  | "webpage"
  | "article"
  | "breadcrumb"
  | "image"
  | "author";

declare module "plumix" {
  interface FilterRegistry {
    /**
     * Whether a piece belongs on this page at all. Return false to drop it —
     * the coarsest of the three tiers, and the one to reach for when a page
     * kind should simply not advertise something.
     *
     * A piece nothing built is never offered, so this only ever narrows.
     * Dropping a piece another piece references leaves that reference
     * dangling, so drop or reshape the referrer too.
     */
    "seo:schema:needs": (
      needed: boolean,
      piece: SchemaPieceName,
      facts: PageFacts,
      ctx: AppContext,
    ) => boolean | Promise<boolean>;
    /**
     * Reshape one piece — add `sameAs` links to the publisher, correct an
     * article's `@type`, attach a `speakable`. Keep the `@id`: it is what the
     * rest of the graph points at.
     */
    "seo:schema:piece": (
      piece: SchemaPiece,
      name: SchemaPieceName,
      facts: PageFacts,
      ctx: AppContext,
    ) => SchemaPiece | Promise<SchemaPiece>;
    /**
     * The whole graph, after the per-piece tiers have run — for a plugin that
     * has to add nodes of its own (a `Product`, an `Event`) or reorder what is
     * there. Returning an empty array emits no script at all.
     */
    "seo:schema:graph": (
      graph: readonly SchemaPiece[],
      facts: PageFacts,
      ctx: AppContext,
    ) => readonly SchemaPiece[] | Promise<readonly SchemaPiece[]>;
  }
}

/**
 * The schema.org types an editor can pick between for an entry. Article
 * subtypes only: the piece keeps its `@id` and its references either way, so
 * the choice is which kind of article this is, not whether the page has one.
 */
export const SCHEMA_TYPES = [
  "Article",
  "BlogPosting",
  "NewsArticle",
  "TechArticle",
] as const;

export type SchemaType = (typeof SCHEMA_TYPES)[number];

export const DEFAULT_SCHEMA_TYPE: SchemaType = "Article";

/** A stored value, narrowed to the roster — anything else is not an answer. */
export function toSchemaType(value: string | null): SchemaType | null {
  return SCHEMA_TYPES.find((type) => type === value) ?? null;
}

/** Everything the graph is written from, resolved by the head. */
export interface SchemaInputs {
  /** The page's own URL — every page-scoped `@id` hangs off it. */
  readonly canonical: string;
  /** The site root — every site-scoped `@id`'s base. */
  readonly home: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly siteName: string | null;
  readonly siteDescription: string | null;
  /** BCP 47, as `inLanguage` wants it. */
  readonly locale: string;
  readonly image: OgImage | null;
  readonly published: Date | null;
  readonly modified: Date | null;
  /** The byline, on an entry page that has one. */
  readonly author: { readonly slug: string; readonly name: string } | null;
  /** The entry's schema type, or null on a page that is not an entry. */
  readonly articleType: SchemaType | null;
  readonly represents: SiteRepresents;
  readonly breadcrumbs: readonly BreadcrumbItem[];
}

/**
 * Every `@id` on the page, derived from the canonical URL and the site root —
 * so two renders of one URL produce the same identifiers, and a piece can be
 * referenced before it is built.
 */
function identifiers(inputs: SchemaInputs): Record<SchemaPieceName, string> {
  const { home, canonical } = inputs;
  return {
    website: `${home}#website`,
    publisher: `${home}#${inputs.represents}`,
    webpage: `${canonical}#webpage`,
    article: `${canonical}#article`,
    breadcrumb: `${canonical}#breadcrumb`,
    image: `${canonical}#primaryimage`,
    // Slugged rather than positional: a byline follows the person between
    // pages, so their node has to keep one identity across the site.
    author: `${home}#/schema/person/${inputs.author?.slug ?? ""}`,
  };
}

function ref(id: string): JsonObject {
  return { "@id": id };
}

// A piece is built from a bag that may hold nothing for a key — an entry with
// no excerpt, a page with no image — and an absent property is spelled by
// leaving the key out, not by emitting null.
function piece(
  type: string,
  id: string,
  body: Readonly<Record<string, JsonValue | undefined>>,
): SchemaPiece {
  const out: Record<string, JsonValue> = { "@type": type, "@id": id };
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) out[key] = value;
  }
  return out as SchemaPiece;
}

/**
 * The graph this page would emit before any filter runs, keyed by role. A
 * piece with nothing to say is absent rather than empty: no image means no
 * `ImageObject` and no `primaryImageOfPage` pointing at one.
 */
function buildSchemaGraph(
  inputs: SchemaInputs,
): ReadonlyMap<SchemaPieceName, SchemaPiece> {
  const id = identifiers(inputs);
  // Absent rather than wrong: a site that never set a title has no name to
  // publish, and its URL is not one.
  const name = inputs.siteName ?? undefined;
  const image = inputs.image?.url ? inputs.image : null;
  const hasCrumbs = inputs.breadcrumbs.length > 0;
  const pieces = new Map<SchemaPieceName, SchemaPiece>();

  pieces.set(
    "website",
    piece("WebSite", id.website, {
      url: inputs.home,
      name,
      description: inputs.siteDescription ?? undefined,
      publisher: ref(id.publisher),
      inLanguage: inputs.locale,
    }),
  );
  pieces.set(
    "publisher",
    piece(
      inputs.represents === "person" ? "Person" : "Organization",
      id.publisher,
      { name, url: inputs.home },
    ),
  );
  pieces.set(
    "webpage",
    piece("WebPage", id.webpage, {
      url: inputs.canonical,
      name: inputs.title ?? undefined,
      description: inputs.description ?? undefined,
      isPartOf: ref(id.website),
      breadcrumb: hasCrumbs ? ref(id.breadcrumb) : undefined,
      primaryImageOfPage: image ? ref(id.image) : undefined,
      datePublished: inputs.published?.toISOString(),
      dateModified: inputs.modified?.toISOString(),
      inLanguage: inputs.locale,
    }),
  );
  if (inputs.articleType !== null) {
    pieces.set(
      "article",
      piece(inputs.articleType, id.article, {
        headline: inputs.title ?? undefined,
        description: inputs.description ?? undefined,
        isPartOf: ref(id.webpage),
        mainEntityOfPage: ref(id.webpage),
        datePublished: inputs.published?.toISOString(),
        dateModified: inputs.modified?.toISOString(),
        author: inputs.author ? ref(id.author) : undefined,
        publisher: ref(id.publisher),
        image: image ? ref(id.image) : undefined,
        inLanguage: inputs.locale,
      }),
    );
  }
  if (hasCrumbs) {
    pieces.set(
      "breadcrumb",
      piece("BreadcrumbList", id.breadcrumb, {
        itemListElement: inputs.breadcrumbs.map((step, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: step.name,
          // The page you are already on carries no `item`, which is what
          // Google asks of the last step.
          ...(step.url === null ? {} : { item: step.url }),
        })),
      }),
    );
  }
  if (image) {
    pieces.set(
      "image",
      piece("ImageObject", id.image, {
        url: image.url,
        contentUrl: image.url,
        width: image.width,
        height: image.height,
      }),
    );
  }
  // Only an entry has a byline; an author archive's author is the subject of
  // the page, not the author of anything on it.
  if (inputs.author && inputs.articleType !== null) {
    pieces.set(
      "author",
      piece("Person", id.author, { name: inputs.author.name }),
    );
  }
  return pieces;
}

/**
 * The graph for this page, through all three filter tiers: each piece is
 * offered for dropping, then for reshaping, then the surviving set is offered
 * whole.
 */
export async function schemaGraph(
  ctx: AppContext,
  facts: PageFacts,
  inputs: SchemaInputs,
): Promise<readonly SchemaPiece[]> {
  const kept: SchemaPiece[] = [];
  for (const [name, built] of buildSchemaGraph(inputs)) {
    const needed = await ctx.hooks.applyFilter(
      "seo:schema:needs",
      true,
      name,
      facts,
      ctx,
    );
    if (!needed) continue;
    kept.push(
      await ctx.hooks.applyFilter("seo:schema:piece", built, name, facts, ctx),
    );
  }
  return ctx.hooks.applyFilter("seo:schema:graph", kept, facts, ctx);
}

/**
 * The graph as the tag that carries it. `headEnd` rather than the body so it
 * sits with the rest of the page's claims about itself.
 */
export function schemaScript(graph: readonly SchemaPiece[]): DocumentScript {
  return {
    type: "application/ld+json",
    position: "headEnd",
    children: serializeJsonLd({
      "@context": "https://schema.org",
      "@graph": graph,
    }),
  };
}
