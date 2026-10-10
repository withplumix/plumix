/**
 * `settings.get`/`settings.upsert` refuse groups ending in this, since
 * `settings:manage` is a mintable token scope. Server-side reads still see
 * them.
 */
const PRIVATE_GROUP_SUFFIX = "_internal";

/** Where a plugin's server-only settings rows live, given its namespace. */
export function privateSettingsGroup(namespace: string): string {
  return `${namespace}${PRIVATE_GROUP_SUFFIX}`;
}

export function isPrivateSettingsGroup(group: string): boolean {
  return group.endsWith(PRIVATE_GROUP_SUFFIX);
}
