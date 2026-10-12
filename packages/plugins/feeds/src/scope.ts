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
 * A type declaring `access` is syndicated too: `publicEntryRows` asks each
 * entry's policy for the requesting reader (ADR 0037).
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
