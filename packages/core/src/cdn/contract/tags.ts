// Coarse cache-tag vocabulary (PRD #1080). Archive-class pages carry the type
// tag `t:<type>`; entry permalinks carry the entry tag `e:<id>`. Publishing an
// entry purges both — its permalink and every archive of that type.
//
// A `contract/` half because two layers speak it: the CDN stores and purges
// pages by these tags, and the request memo (`context/`, a layer below) drops
// the entries a write announced through them (#2517).
export function typeTag(entryType: string): string {
  return normalizeTag(`t:${entryType}`);
}

/**
 * The one spelling of a tag. At least one target CDN (Netlify) matches tags
 * case-insensitively, so `t:Post` and `t:post` would be two tags on one vendor
 * and one on another — a collision that only ever appears on the vendor the
 * site did not develop against. Applied wherever a tag enters the system:
 * `typeTag` below, a plugin's own `tagCdnEntry`, the embedded-reference and
 * purge accumulators, and the request memo — so a plugin's stored tag and its
 * purge cannot disagree, and neither can a memo entry and the write that
 * invalidates it.
 * `entryTag` needs no call: its input is a number.
 */
export function normalizeTag(tag: string): string {
  return tag.toLowerCase();
}

export function entryTag(entryId: number): string {
  return `e:${String(entryId)}`;
}

/** Tags to purge when an entry of `entryType` (id `entryId`) changes. */
export function entryPurgeTags(entryType: string, entryId: number): string[] {
  return [typeTag(entryType), entryTag(entryId)];
}

/**
 * Tags to purge when a term changes. A term archive carries the `t:<type>`
 * tags of the entry types its taxonomy lists, so purging those clears the
 * archive and the listings that show the term's name.
 */
export function termPurgeTags(taxonomyEntryTypes: readonly string[]): string[] {
  return taxonomyEntryTypes.map(typeTag);
}

/**
 * The tags a change to any user reaches, given every public entry type. Author
 * feeds and every public entry's permalink and listing print the author, and
 * each is stored under a public type's tag — so a rename, a re-slug, or a
 * delete purges them all, whatever type the author wrote.
 */
export function usersPurgeTags(publicEntryTypes: readonly string[]): string[] {
  return publicEntryTypes.map(typeTag);
}

/**
 * One user's own tag. No page is stored under it, so it never reaches a purge:
 * a user write drops it from the request memo beside {@link usersPurgeTags},
 * so a memoized author row drops on a change to that author and survives
 * every other write.
 */
export function userTag(userId: number): string {
  return `u:${String(userId)}`;
}

/**
 * A settings group's tag. No page is stored under it either, so it never
 * reaches a purge: a settings write drops it from the request memo alone.
 */
export function settingsTag(group: string): string {
  return normalizeTag(`s:${group}`);
}
