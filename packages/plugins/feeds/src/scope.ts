import type { PluginRegistry, RegisteredTermTaxonomy } from "plumix";
import { termTaxonomyBaseSlug } from "plumix";

/**
 * What a feed covers: the whole site, one entry type, one taxonomy term, one
 * author, a date period, or a plugin-registered archive (`custom`). `taxonomy`
 * is the registered name; `path` is the term's slug path (a single segment for a
 * top-level term, `parent/child` for a nested one). `slug` on the author scope
 * is the user's slug; `custom.name`/`params` name a registered archive feed.
 */
export type FeedScope =
  | { readonly kind: "site" }
  | { readonly kind: "type"; readonly type: string }
  | {
      readonly kind: "term";
      readonly taxonomy: string;
      readonly path: readonly string[];
    }
  | { readonly kind: "author"; readonly slug: string }
  | {
      readonly kind: "date";
      readonly year: number;
      readonly month: number | null;
      readonly day: number | null;
    }
  | {
      readonly kind: "custom";
      readonly name: string;
      readonly params: Record<string, string>;
    };

/** Whether a scope names a registered, public entry type. */
export function isPublicEntryType(
  plugins: PluginRegistry,
  type: string,
): boolean {
  const entryType = plugins.entryTypes.get(type);
  return entryType !== undefined && entryType.isPublic !== false;
}

/**
 * The public taxonomies keyed by the URL segment their archives live under.
 * Two taxonomies can compile to the same base slug — the router already
 * resolves that first-registered-wins — so the map keeps the first, and the
 * routes registered off it stay one per URL space rather than colliding.
 */
export function publicTaxonomiesByBaseSlug(
  plugins: PluginRegistry,
): ReadonlyMap<string, RegisteredTermTaxonomy> {
  const bySlug = new Map<string, RegisteredTermTaxonomy>();
  for (const taxonomy of plugins.termTaxonomies.values()) {
    if (taxonomy.isPublic === false) continue;
    const slug = termTaxonomyBaseSlug(taxonomy);
    if (!bySlug.has(slug)) bySlug.set(slug, taxonomy);
  }
  return bySlug;
}

export function publicEntryTypeNames(plugins: PluginRegistry): string[] {
  return [...plugins.entryTypes.values()]
    .filter((type) => type.isPublic !== false)
    .map((type) => type.name);
}
