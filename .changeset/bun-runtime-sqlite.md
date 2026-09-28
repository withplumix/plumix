---
"@plumix/runtime-bun": minor
---

Adds the `@plumix/runtime-bun` package with its first slot, `bunSqlite({ path })`: the database over `bun:sqlite` through drizzle's own `bun-sqlite` session. The file opens with WAL, a 5 second busy timeout, `synchronous = NORMAL` and foreign keys on, which Bun does not default to; parent directories are created, and a relative path resolves against the project root. `rowsAffected` counts only a write's own rows, not those its triggers wrote, and a Date in a raw `sql` template binds as epoch milliseconds, as on the Node runtime. The `./commands` subpath contributes `plumix migrate apply`, run as `bun --bun plumix migrate apply`; under Node it stops with a `bun_required` error naming that command. The `bun()` adapter, `dev` and `build` follow in later releases.
