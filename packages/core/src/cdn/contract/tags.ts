// Archives carry `t:<type>`, permalinks `e:<id>`, pages that read a settings
// group `s:<group>`; a write purges the matching tags.
export function typeTag(entryType: string): string {
  return normalizeTag(`t:${entryType}`);
}

/**
 * Netlify matches tags case-insensitively, so every tag entering the system
 * goes through here or `t:Post` and `t:post` collide on one vendor only.
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

/** A term archive carries the `t:<type>` tags of its taxonomy's entry types. */
export function termPurgeTags(taxonomyEntryTypes: readonly string[]): string[] {
  return taxonomyEntryTypes.map(typeTag);
}

/**
 * Every public entry page prints its author, so any user change purges all
 * public types.
 */
export function usersPurgeTags(publicEntryTypes: readonly string[]): string[] {
  return publicEntryTypes.map(typeTag);
}

/**
 * No page is stored under it; it only drops that user's memoized row from the
 * request memo.
 */
export function userTag(userId: number): string {
  return `u:${String(userId)}`;
}

export function settingsTag(group: string): string {
  return normalizeTag(`s:${group}`);
}
