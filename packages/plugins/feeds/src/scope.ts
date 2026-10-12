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
 * `publicEntryRows` applies each entry's policy, so a type's `access` is no
 * reason to skip it.
 */
export function isSyndicatableEntryType(
  type: RegisteredEntryType | undefined,
): boolean {
  return type?.isPublic === true;
}

export function syndicatableEntryTypeNames(plugins: PluginRegistry): string[] {
  return [...plugins.entryTypes.values()]
    .filter(isSyndicatableEntryType)
    .map((type) => type.name);
}
