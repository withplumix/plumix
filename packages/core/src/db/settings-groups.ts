// A settings group whose name ends here holds server-only rows: something
// core or a plugin keeps in the settings table without ever putting it on a
// settings page. `settings.get` / `settings.upsert` refuse these groups.
// `settings:manage` is admin-wide and mintable as a narrow API-token scope,
// so a secret in this table needs a name the RPC refuses rather than a name
// nobody happens to guess.
//
// The refusal covers those two procedures and nothing else — `loadSettingsGroups`
// and the core `settings` template dep still read the rows server-side, which is
// the point: this defends against a `settings:manage` holder, not against code
// running in the worker.
const PRIVATE_GROUP_SUFFIX = "_internal";

/** Where a plugin's server-only settings rows live, given its namespace. */
export function privateSettingsGroup(namespace: string): string {
  return `${namespace}${PRIVATE_GROUP_SUFFIX}`;
}

export function isPrivateSettingsGroup(group: string): boolean {
  return group.endsWith(PRIVATE_GROUP_SUFFIX);
}
