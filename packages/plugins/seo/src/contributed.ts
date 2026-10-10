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
  /**
   * URLs for one 1-based page, windowed to `SITEMAP_PAGE_SIZE` as the index
   * expects.
   */
  readonly urls: (
    ctx: AppContext,
    page: number,
  ) => Promise<readonly SitemapUrl[]> | readonly SitemapUrl[];
  /**
   * With none, the scope's pages are never purged and ride their cache-control
   * window.
   */
  readonly tags?: readonly string[];
  /** ISO-8601 `<lastmod>` for one 1-based page; `undefined` writes none. */
  readonly lastmod?: (
    ctx: AppContext,
    page: number,
  ) => Promise<string | undefined> | string | undefined;
}

declare module "plumix" {
  interface PluginContextExtensions {
    /**
     * Serves `/sitemap-<name>-<page>.xml`. Call it on `ctx` during `setup`:
     * `this` is how seo learns which plugin the scope came from.
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

/**
 * These own every stem starting with their name, so a contributed scope by one
 * would answer for an entry type's or taxonomy's sub-sitemap.
 */
const RESERVED_SCOPE_KINDS = ["entries", "terms"] as const;

function assertContributable(name: string, pluginId: string): void {
  const reserved = RESERVED_SCOPE_KINDS.some(
    (kind) => name === kind || name.startsWith(`${kind}-`),
  );
  if (!reserved) return;
  throw SeoError.reservedSitemapScope({ scope: name, pluginId });
}

type RegisterSitemap = PluginContextExtensions["registerSitemap"];

/**
 * Keyed by the install's `registerSitemap`: core puts that same function on
 * every setup context, which is how `afterSetup` finds its install's list.
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

/**
 * What every plugin contributed through this `registerSitemap`, in call order.
 */
export function contributedSitemaps(
  registerSitemap: RegisterSitemap,
): readonly ContributedSitemap[] {
  return contributions.get(registerSitemap) ?? [];
}
