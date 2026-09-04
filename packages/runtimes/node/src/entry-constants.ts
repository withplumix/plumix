// What the adapter and the entry it generates agree on.

/**
 * Where the assets layer reads from, named on the invocation's env — the
 * Node twin of Cloudflare's `ASSETS` binding. The entry points it at
 * `dist/client` beside itself; without it the admin answers
 * `admin-not-available`.
 */
export const ASSETS_DIR_ENV = "PLUMIX_ASSETS_DIR";

/** One deadline for a shutdown: in-flight responses first, deferred work in what remains. */
export const DRAIN_DEADLINE_MS = 10_000;
