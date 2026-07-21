import type { ResolvedEntity } from "../route/current.js";
import type { RouteIntent } from "../route/intent.js";

// Coarse cache-tag vocabulary (PRD #1080). Archive-class pages carry the type
// tag `t:<type>`; entry permalinks carry the entry tag `e:<id>`. Publishing an
// entry purges both, busting its permalink and every archive of that type.
export function typeTag(entryType: string): string {
  return `t:${entryType}`;
}

export function entryTag(entryId: number): string {
  return `e:${String(entryId)}`;
}

interface PageTagSources {
  readonly intent: RouteIntent;
  readonly resolvedEntity: ResolvedEntity | null;
  /** Entry types the front page lists (public, non-hierarchical). */
  readonly frontPageEntryTypes: () => readonly string[];
  /** Entry types attached to the named taxonomy. */
  readonly taxonomyEntryTypes: (taxonomy: string) => readonly string[];
}

/**
 * The cache tags a rendered public page is stored under. Every page that lists
 * or embeds type-`X` content — its archives, the front page, term archives,
 * and an entry permalink (which can render sibling content like related posts)
 * — carries `t:X`, so any publish of that type busts it. A permalink also
 * carries its own `e:<id>` so an edit to just that entry busts it precisely.
 */
export function pageTags(sources: PageTagSources): string[] {
  const { intent, resolvedEntity } = sources;
  switch (intent.kind) {
    case "single":
      return resolvedEntity?.kind === "entry"
        ? [typeTag(intent.entryType), entryTag(resolvedEntity.id)]
        : [];
    case "archive":
      return [typeTag(intent.entryType)];
    case "front-page":
      return sources.frontPageEntryTypes().map(typeTag);
    case "taxonomy":
      return sources.taxonomyEntryTypes(intent.taxonomy).map(typeTag);
    case "author":
      // An author archive lists the same public, non-hierarchical type set as
      // the front page, so any publish of those types can change it.
      return sources.frontPageEntryTypes().map(typeTag);
    case "search":
      return [];
  }
}

/** Tags to purge when an entry of `entryType` (id `entryId`) changes. */
export function entryPurgeTags(entryType: string, entryId: number): string[] {
  return [typeTag(entryType), entryTag(entryId)];
}

/**
 * Tags to purge when a term changes. A term archive carries the `t:<type>`
 * tags of the entry types its taxonomy lists, so purging those busts the
 * archive and the listings that show the term's name.
 */
export function termPurgeTags(taxonomyEntryTypes: readonly string[]): string[] {
  return taxonomyEntryTypes.map(typeTag);
}
