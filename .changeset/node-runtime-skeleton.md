---
"@plumix/runtime-node": minor
---

Adds the `@plumix/runtime-node` package with its first slot, `nodeSqlite({ path })`: the database over `node:sqlite` through a small better-sqlite3-shaped client plugged into drizzle's session, so nothing native is installed. The file opens with WAL, a 5 second busy timeout, `synchronous = NORMAL` and foreign keys on, and its parent directories are created. The `./commands` subpath contributes `plumix migrate apply`, which runs drizzle's migrator over the generated `drizzle/` directory against that file. The `node()` adapter, `dev` and `build` follow in later slices.
