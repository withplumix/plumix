import type { PageFacts, TemplateData } from "plumix";
import type { OgImage } from "plumix/plugin";
import { defineFilter } from "plumix/plugin";

import type { SchemaPiece, SchemaPieceName } from "./schema.js";
import type { SitemapScopeRef, SitemapUrl } from "./sitemap.js";

/**
 * The seo plugin's filters. They ride on the root's `seo()` factory, which
 * already takes the name, so `seo.ogImage` is what another plugin subscribes
 * to.
 */
export const seoFilters = {
  /**
   * Not applied when the author chose an image. Returning an image outranks
   * `featured` and the site default, so pass the value through on pages you
   * don't handle.
   */
  ogImage: defineFilter<
    OgImage | null,
    { readonly data: TemplateData; readonly featured: OgImage | null }
  >("seo:og_image", { sync: false }),
  /**
   * The generated `/robots.txt` body: add `Sitemap:` lines, a crawl-delay, or
   * per-agent rules without owning the route.
   */
  robotsTxt: defineFilter<string>("seo:robots-txt", { sync: false }),
  /**
   * The generated `/llms.txt` body: list the pages that matter, add a section,
   * or replace it outright without owning the route.
   */
  llmsTxt: defineFilter<string>("seo:llms-txt", { sync: false }),
  sitemap: {
    /** Applied even on an empty page, so a handler can inject rows. */
    urls: defineFilter<
      readonly SitemapUrl[],
      { readonly scope: SitemapScopeRef; readonly page: number }
    >("seo:sitemap:urls", { sync: false }),
  },
  schema: {
    /**
     * Only ever narrows. Dropping a piece another references leaves that
     * reference dangling, so drop or reshape the referrer too.
     */
    needs: defineFilter<
      boolean,
      { readonly name: SchemaPieceName; readonly facts: PageFacts }
    >("seo:schema:needs", { sync: false }),
    /**
     * Reshape one piece: add `sameAs` links to the publisher, correct an
     * article's `@type`, attach a `speakable`. Keep the `@id`: it is what the
     * rest of the graph points at.
     */
    piece: defineFilter<
      SchemaPiece,
      { readonly name: SchemaPieceName; readonly facts: PageFacts }
    >("seo:schema:piece", { sync: false }),
    /** Applied after the per-piece tiers. An empty array emits no script. */
    graph: defineFilter<readonly SchemaPiece[], { readonly facts: PageFacts }>(
      "seo:schema:graph",
      { sync: false },
    ),
  },
};
