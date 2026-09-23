import type { SQL } from "plumix/db";
import type {
  PluginRegistry,
  RegisteredEntryType,
  RegisteredTermTaxonomy,
} from "plumix/plugin";
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

/**
 * Whether a feed may carry this type's entries at all — the entry-type twin of
 * `isSyndicatable`, which asks it of a plugin archive.
 *
 * A feed is fetched by a reader carrying no session and served from a shared
 * cache, so there is no principal to resolve a policy against — which leaves
 * excluding the type, the same answer `plugin-search` reaches for its index.
 * Coarser than the per-entry question: a type declaring `access` is out even
 * where an individual entry's policy would have admitted anyone.
 */
export function isSyndicatableEntryType(
  type: RegisteredEntryType | undefined,
): boolean {
  return type !== undefined && type.isPublic && type.access === undefined;
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

export function syndicatableEntryTypeNames(plugins: PluginRegistry): string[] {
  return [...plugins.entryTypes.values()]
    .filter(isSyndicatableEntryType)
    .map((type) => type.name);
}

/**
 * What a feed never shows, whatever a scope asks for: an unpublished entry, or
 * an entry of a type no feed may syndicate. `null` where the site has no such
 * type left, so there is no feed to serve — which takes the author, date and
 * term feeds with it, not just the type's own.
 *
 * Applied twice — a scope's query is seeded with it, and it is ANDed on again
 * when that query is compiled — so a scope cannot widen a feed even by
 * discarding the query it was handed.
 */
export function feedGuard(plugins: PluginRegistry): SQL | null {
  const typeNames = syndicatableEntryTypeNames(plugins);
  if (typeNames.length === 0) return null;
  return sql`(${inArray(entries.type, typeNames)} and ${eq(entries.status, "published")})`;
}
