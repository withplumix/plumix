// What the adapter and the site module behind the generated entry agree on.

/**
 * The project root, named on the invocation's env: what a relative
 * `bunSqlite()` path resolves against, as `plumix migrate apply` resolves it
 * against `--cwd`. Unset, a relative path resolves against the working
 * directory.
 */
export const PROJECT_ROOT_ENV = "PLUMIX_PROJECT_ROOT";

/**
 * Where the assets binding reads from, named on the invocation's env — the
 * Bun twin of Cloudflare's `ASSETS` binding. `createBunSite` points it at
 * `dist/client` beside the entry; without it the admin answers
 * `admin-not-available`.
 */
export const ASSETS_DIR_ENV = "PLUMIX_ASSETS_DIR";
