/**
 * Archives carry `t:<type>`, permalinks `e:<id>`, pages that rendered a term
 * `tm:<id>`, pages that resolved a user `u:<id>`, pages that read a settings
 * group `s:<group>`; a write purges the matching tags.
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

/** Created and deleted terms purge the `t:<type>` tags of their taxonomy's entry types. */
export function termPurgeTags(taxonomyEntryTypes: readonly string[]): string[] {
  return taxonomyEntryTypes.map(typeTag);
}

/** A page that rendered a term, its archive or an entry's chip, carries it. */
export function termTag(termId: number): string {
  return `tm:${String(termId)}`;
}

/**
 * No page is stored under it; it only drops the request memo's term slug
 * lookups, whose misses have no term id to be tagged by.
 */
export function termSlugsTag(): string {
  return "tm:slugs";
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

/** The core entity a lookup adapter's ids name. */
export type HydratedEntityKind = "entry" | "term" | "user";

/** The tag an id hydrated by a `kind` adapter stores a page under. */
export function hydratedEntityTags(
  kind: HydratedEntityKind,
  id: string,
): readonly string[] {
  switch (kind) {
    case "entry":
      return [entryTag(Number(id))];
    case "user":
      return [userTag(Number(id))];
    case "term":
      return [termTag(Number(id))];
  }
}
