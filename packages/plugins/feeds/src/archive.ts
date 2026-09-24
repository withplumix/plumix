/**
 * The object form of an archive's `feed`. It takes no options yet; it is
 * reserved so a feed-only one can be added without changing what `true`
 * means. Declared here rather than in core: an archive that nothing
 * syndicates has no use for the field.
 */
export type ArchiveTypeFeed = Readonly<Record<string, never>>;

declare module "plumix" {
  interface ListingArchiveTypeOptions {
    /**
     * Syndicate this archive. Each of its routes gains a feed at
     * `<route>/feed`, and `/feed/atom` beside it. The feed is the archive's
     * own `entries`, newest first whatever order the archive declared and
     * capped at `FEED_LIMIT`, so a page and its feed cannot disagree about
     * what the archive contains (ADR 0008). Params `entries` answers `null`
     * for 404 the page and its feed together.
     *
     * Every page of the archive advertises its feed through
     * `<link rel="alternate">`, a later page advertising the feed of the
     * route it paginates. A later page has no feed of its own.
     *
     * An archive declaring an `access` policy gets no feed. A feed is a public
     * route, which core answers ahead of the access gate, so serving one would
     * hand a policied archive's entries to any anonymous reader.
     *
     * Absent, the archive has no feed and advertises none.
     */
    readonly feed?: true | ArchiveTypeFeed;
  }

  interface UnlistedArchiveTypeOptions {
    /** An archive with no `entries` has nothing a feed could read. */
    readonly feed?: undefined;
  }
}
