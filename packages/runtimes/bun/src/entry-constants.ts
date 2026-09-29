// What the adapter and the site module behind the generated entry agree on.

/**
 * The project root, named on the invocation's env: what a relative
 * `bunSqlite()` path resolves against, as `plumix migrate apply` resolves it
 * against `--cwd`. Unset, a relative path resolves against the working
 * directory.
 */
export const PROJECT_ROOT_ENV = "PLUMIX_PROJECT_ROOT";
