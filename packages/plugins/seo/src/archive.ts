import type { AppContext } from "plumix/plugin";

import type { SitemapUrl } from "./sitemap.js";

/**
 * The sitemap URL space a `registerArchiveType` archive can own. Declared here
 * rather than in core: an archive nothing indexes has no use for the field,
 * and core has no sitemap vocabulary left to spell it in.
 */
export interface ArchiveTypeSitemap {
  /** Published URL count — drives index pagination without a full URL scan. */
  readonly count: (ctx: AppContext) => Promise<number> | number;
  /** URLs for one 1-based page, windowed to `SITEMAP_PAGE_SIZE` as the index expects. */
  readonly urls: (
    ctx: AppContext,
    page: number,
  ) => Promise<readonly SitemapUrl[]> | readonly SitemapUrl[];
  /**
   * Cache tags this scope's pages are stored under. Core's own scopes carry
   * the `t:<type>` tags a publish already purges; an archive drawn from other
   * tables names its own, or names none and rides its cache-control window.
   */
  readonly tags?: readonly string[];
}

declare module "plumix" {
  interface ArchiveTypeOptions {
    /**
     * Fold this archive into the sitemap index at
     * `/sitemap-<name>-<page>.xml`. Absent, the archive is not indexed.
     */
    readonly sitemap?: ArchiveTypeSitemap;
  }
}
