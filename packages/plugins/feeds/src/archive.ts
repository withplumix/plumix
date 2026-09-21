import type { EntryQuery } from "plumix/db";

/**
 * The RSS/Atom feed a `registerArchiveType` archive can own. Declared here
 * rather than in core: an archive that nothing syndicates has no use for the
 * field, and core has no feed vocabulary left to spell it in.
 */
export interface ArchiveTypeFeed {
  /**
   * Narrow the entries this feed syndicates, or `null` → 404.
   *
   * The query arrives restricted to what a feed may show — published entries
   * of public types — and every method on it adds a condition, so an archive
   * can say less than it meant to without the feed showing more than it
   * should. It records intent rather than running queries: a term path is
   * resolved when the feed is served, not when the scope is built, so
   * declaring one costs nothing on the pages that merely advertise the feed.
   *
   * `null` and `q.none()` are different answers. `null` says this URL has no
   * feed, and 404s. `none()` says the feed exists and is currently empty.
   */
  readonly scope: (
    q: EntryQuery,
    params: Record<string, string>,
  ) => EntryQuery | null;
}

declare module "plumix" {
  interface ArchiveTypeOptions {
    /**
     * Syndicate this archive. Each of its routes gains a feed at
     * `<route>/feed`, and `/feed/atom` beside it, with `scope` reading the
     * params the archive route captured. A route ending in
     * `FRAMEWORK_PAGINATION_SUFFIX` is a later page of a listing rather than a
     * listing of its own, so it gets no feed, and its pages advertise the
     * feed of the route it paginates.
     *
     * Every page of the archive advertises its feed through
     * `<link rel="alternate">` wherever `scope` answers for that page's
     * params. That puts `scope` on the page's render as well as the feed's —
     * which is why it records intent instead of querying, and why a narrowing
     * that only fails to resolve when the feed is served (a term slug nothing
     * answers to) is still advertised. Answer `null` for params the archive
     * cannot place, as its own `resolve` does, and the page and its feed 404
     * together. A page whose feed URL another feed's
     * route also answers (an entry type named like the archive's route)
     * advertises none, since the head cannot promise which feed serves it. Nor
     * does a later page of a multi-segment capture (`/docs/:path+`) get a feed
     * of its own.
     *
     * An archive declaring an `access` policy gets no feed. A feed is a public
     * route, which core answers ahead of the access gate, so serving one would
     * hand a policied archive's entries to any anonymous reader.
     *
     * Absent, the archive has no feed and advertises none.
     */
    readonly feed?: ArchiveTypeFeed;
  }
}
