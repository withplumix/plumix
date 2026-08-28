import type { AppContext } from "plumix";
import type { SQL } from "plumix/db";

/**
 * The RSS/Atom feed a `registerArchiveType` archive can own. Declared here
 * rather than in core: an archive that nothing syndicates has no use for the
 * field, and core has no feed vocabulary left to spell it in.
 */
export interface ArchiveTypeFeed {
  /** URLPattern pathnames the feed answers (e.g. `/events/:series/feed`). */
  readonly routes: readonly string[];
  /** SQL row filter for the feed's entries, or `null` → 404. */
  readonly filter: (
    ctx: AppContext,
    params: Record<string, string>,
  ) => Promise<SQL | null> | SQL | null;
}

declare module "plumix" {
  interface ArchiveTypeOptions {
    /**
     * Syndicate this archive. The `/atom` variant of each route is served
     * too, so declare the base route only. Absent, the archive has no feed
     * and advertises none.
     */
    readonly feed?: ArchiveTypeFeed;
  }
}
