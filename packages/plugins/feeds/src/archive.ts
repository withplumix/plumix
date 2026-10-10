/**
 * Takes no options yet; reserved so feed-only options can be added without
 * changing what `true` means.
 */
export type ArchiveTypeFeed = Readonly<Record<string, never>>;

declare module "plumix" {
  interface ListingArchiveTypeOptions {
    /**
     * Adds `<route>/feed` and `<route>/feed/atom`: the archive's own `entries`,
     * newest first whatever its declared order. Ignored when the archive
     * declares `access`, since feeds are answered ahead of the access gate.
     */
    readonly feed?: true | ArchiveTypeFeed;
  }

  interface UnlistedArchiveTypeOptions {
    /** An archive with no `entries` has nothing a feed could read. */
    readonly feed?: undefined;
  }
}
