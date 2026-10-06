import type { PluginContextExtensions } from "plumix";
import type { AppContext } from "plumix/plugin";

import type { SitemapUrl } from "./sitemap.js";
import { SeoError } from "./errors.js";

/**
 * A URL space a plugin contributes to the sitemap index with
 * `ctx.registerSitemap`. Declared here rather than in core: core has no
 * sitemap vocabulary to spell it in.
 */
export interface SitemapSource {
  /** Published URL count — drives index pagination without a full URL scan. */
  readonly count: (ctx: AppContext) => Promise<number> | number;
  /** URLs for one 1-based page, windowed to `SITEMAP_PAGE_SIZE` as the index expects. */
  readonly urls: (
    ctx: AppContext,
    page: number,
  ) => Promise<readonly SitemapUrl[]> | readonly SitemapUrl[];
  /**
   * Cache tags this scope's pages are stored under. Core's own scopes carry
   * the `t:<type>` tags a publish already purges; a source drawn from other
   * tables names its own, or names none and rides its cache-control window.
   */
  readonly tags?: readonly string[];
  /**
   * The ISO-8601 time the newest URL on one 1-based page changed, written as
   * that page's `<lastmod>` in the index. Absent, or `undefined` for a page,
   * and the index entry carries none.
   */
  readonly lastmod?: (
    ctx: AppContext,
    page: number,
  ) => Promise<string | undefined> | string | undefined;
}

declare module "plumix" {
  interface PluginContextExtensions {
    /**
     * Fold a URL space into the sitemap index as a contributed scope at
     * `/sitemap-<name>-<page>.xml`, under the site's `sitemaps.<name>`
     * policy. Call it on `ctx` during `setup`: `this` is how seo learns
     * which plugin the scope came from.
     */
    registerSitemap(
      this: { readonly id: string },
      name: string,
      source: SitemapSource,
    ): void;
  }
}

/** One `registerSitemap` call, with the plugin that made it. */
export interface ContributedSitemap {
  readonly name: string;
  readonly pluginId: string;
  readonly source: SitemapSource;
}

// Seo's own scope kinds, which own every stem starting with their name — so a
// contributed scope by one of these names would answer for an entry type's or
// a taxonomy's sub-sitemap.
const RESERVED_SCOPE_KINDS = ["entries", "terms"] as const;

export function assertContributable(name: string, pluginId: string): void {
  const reserved = RESERVED_SCOPE_KINDS.some(
    (kind) => name === kind || name.startsWith(`${kind}-`),
  );
  if (!reserved) return;
  throw SeoError.reservedSitemapScope({ scope: name, pluginId });
}

type RegisterSitemap = PluginContextExtensions["registerSitemap"];

/**
 * Each install's contributions, keyed by the `registerSitemap` its `provides`
 * handed out — core puts that same function on every setup context, which is
 * how `afterSetup` finds its own install's list.
 */
const contributions = new WeakMap<RegisterSitemap, ContributedSitemap[]>();

/** A fresh `registerSitemap` for one install, collecting into its own list. */
export function createRegisterSitemap(): RegisterSitemap {
  const contributed: ContributedSitemap[] = [];
  const registerSitemap: RegisterSitemap = function registerSitemap(
    name,
    source,
  ) {
    assertContributable(name, this.id);
    const existing = contributed.find((entry) => entry.name === name);
    if (existing) {
      throw SeoError.duplicateSitemapScope({
        scope: name,
        pluginId: this.id,
        existingPluginId: existing.pluginId,
      });
    }
    contributed.push({ name, pluginId: this.id, source });
  };
  contributions.set(registerSitemap, contributed);
  return registerSitemap;
}

/** What every plugin contributed through this `registerSitemap`, in call order. */
export function contributedSitemaps(
  registerSitemap: RegisterSitemap,
): readonly ContributedSitemap[] {
  return contributions.get(registerSitemap) ?? [];
}
