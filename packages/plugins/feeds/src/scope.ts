import type { SQL } from "plumix/db";
import type { PluginRegistry, RegisteredTermTaxonomy } from "plumix/plugin";
import { eq, inArray, sql } from "plumix/db";
import { termTaxonomyBaseSlug } from "plumix/plugin";
import { entries } from "plumix/schema";

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
  return plugins.entryTypes.get(type)?.isPublic ?? false;
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
    if (!taxonomy.isPublic) continue;
    const slug = termTaxonomyBaseSlug(taxonomy);
    if (!bySlug.has(slug)) bySlug.set(slug, taxonomy);
  }
  return bySlug;
}

export function publicEntryTypeNames(plugins: PluginRegistry): string[] {
  return [...plugins.entryTypes.values()]
    .filter((type) => type.isPublic)
    .map((type) => type.name);
}

/**
 * What a feed never shows, whatever a scope asks for: an unpublished entry, or
 * an entry of a type the site does not route publicly. `null` where the site
 * routes no public type, so there is no feed to serve.
 *
 * Applied twice — a scope's query is seeded with it, and it is ANDed on again
 * when that query is compiled — so a scope cannot widen a feed even by
 * discarding the query it was handed.
 */
export function feedGuard(plugins: PluginRegistry): SQL | null {
  const typeNames = publicEntryTypeNames(plugins);
  if (typeNames.length === 0) return null;
  return sql`(${inArray(entries.type, typeNames)} and ${eq(entries.status, "published")})`;
}
