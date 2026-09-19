import type { AppContext } from "plumix";
import type { SQL } from "plumix/db";

/**
 * The RSS/Atom feed a `registerArchiveType` archive can own. Declared here
 * rather than in core: an archive that nothing syndicates has no use for the
 * field, and core has no feed vocabulary left to spell it in.
 */
export interface ArchiveTypeFeed {
  /** SQL row filter for the feed's entries, or `null` → 404. */
  readonly filter: (
    ctx: AppContext,
    params: Record<string, string>,
  ) => Promise<SQL | null> | SQL | null;
}

declare module "plumix" {
  interface ArchiveTypeOptions {
    /**
     * Syndicate this archive. Each of its routes gains a feed at
     * `<route>/feed`, and `/feed/atom` beside it, with `filter` reading the
     * params the archive route captured. A route ending in
     * `FRAMEWORK_PAGINATION_SUFFIX` is a later page of a listing rather than a
     * listing of its own, so it gets no feed, and its pages advertise the
     * feed of the route it paginates.
     *
     * Every page of the archive advertises its feed through
     * `<link rel="alternate">` wherever `filter` answers for that page's
     * params, so the head never names a feed that would 404. That puts
     * `filter` on the page's render as well as the feed's: keep any lookup it
     * makes cheap, and answer `null` rather than throw. A page whose feed
     * URL another feed's route also answers (an entry type named like the
     * archive's route) advertises none, since the head cannot promise which
     * feed serves it. Nor does a later page of a multi-segment capture
     * (`/docs/:path+`) get a feed of its own.
     *
     * Absent, the archive has no feed and advertises none.
     */
    readonly feed?: ArchiveTypeFeed;
  }
}
