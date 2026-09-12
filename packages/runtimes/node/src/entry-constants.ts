// What the adapter and the site module behind the generated entry agree on.

/**
 * Where the assets layer reads from, named on the invocation's env — the
 * Node twin of Cloudflare's `ASSETS` binding. `createNodeSite` points it at
 * `dist/client` beside the entry; without it the admin answers
 * `admin-not-available`.
 */
export const ASSETS_DIR_ENV = "PLUMIX_ASSETS_DIR";

/** One deadline for a shutdown: in-flight responses first, deferred work in what remains. */
export const DRAIN_DEADLINE_MS = 10_000;
