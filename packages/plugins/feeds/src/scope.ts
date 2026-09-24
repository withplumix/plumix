import type {
  EntryArchive,
  PluginRegistry,
  RegisteredEntryType,
} from "plumix/plugin";

/**
 * The archive a feed syndicates, as core's archive lookup names it — one of
 * the built-in listings (`front-page`, `archive`, `taxonomy`, `author`,
 * `date`) or a plugin archive (`custom`) — and the params its route captured.
 */
export interface FeedScope {
  readonly archive: EntryArchive;
  readonly params: Record<string, string>;
}

/**
 * Whether a feed may carry this type's entries at all.
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

export function syndicatableEntryTypeNames(plugins: PluginRegistry): string[] {
  return [...plugins.entryTypes.values()]
    .filter(isSyndicatableEntryType)
    .map((type) => type.name);
}
