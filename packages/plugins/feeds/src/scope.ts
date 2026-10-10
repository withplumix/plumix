import type {
  EntryArchive,
  PluginRegistry,
  RegisteredEntryType,
} from "plumix/plugin";

export interface FeedScope {
  readonly archive: EntryArchive;
  readonly params: Record<string, string>;
}

/**
 * A type declaring `access` is excluded even where an entry's policy would
 * admit anyone: feeds are sessionless and shared-cached, so there's no
 * principal.
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
