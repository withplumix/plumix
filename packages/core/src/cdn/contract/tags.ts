/**
 * Archives carry `t:<type>`, permalinks `e:<id>`, pages that resolved a user
 * `u:<id>`, pages that read a settings group `s:<group>`; a write purges the
 * matching tags.
 */
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

/** A page that read a user, an author's byline or archive, carries it. */
export function userTag(userId: number): string {
  return `u:${String(userId)}`;
}

/**
 * No page is stored under it; it only drops the request memo's slug lookups,
 * whose misses have no user id to be tagged by.
 */
export function userSlugsTag(): string {
  return "u:slugs";
}

export function settingsTag(group: string): string {
  return normalizeTag(`s:${group}`);
}

/**
 * A plugin id holds no `:` or `*` (`PLUGIN_ID_RE`), so no key reaches another
 * plugin's namespace.
 */
export function pluginReadTags(
  pluginId: string,
  key: string | number | undefined,
): string[] {
  const namespace = `p:${pluginId}`;
  return [
    namespace,
    key === undefined ? `${namespace}*` : `${namespace}:${String(key)}`,
  ].map(normalizeTag);
}

export function pluginChangedTags(
  pluginId: string,
  key: string | number | undefined,
): string[] {
  const namespace = `p:${pluginId}`;
  return (
    key === undefined
      ? [namespace]
      : [`${namespace}:${String(key)}`, `${namespace}*`]
  ).map(normalizeTag);
}
