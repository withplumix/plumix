/**
 * Who may rebuild the index. Registered at `admin` because a rebuild is an
 * operator's recovery tool — it is bounded and safe to repeat, but it is the
 * answer to "the import went wrong", not something an editor reaches for.
 */
export const REINDEX_CAPABILITY = "search:reindex";

/** Mounted under the plugin's own prefix, so `/_plumix/search/reindex`. */
export const REINDEX_ROUTE_PATH = "/reindex";

/** The whole path, for anything addressing the route from outside. */
export const REINDEX_URL = `/_plumix/search${REINDEX_ROUTE_PATH}`;
