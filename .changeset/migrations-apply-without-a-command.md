---
"plumix": minor
---

Applies migrations without a command. `plumix dev` applies every owner's pending migrations to the local database before it serves, adopting a database set up by an earlier release, and when the site's own tables changed it first writes their next migration to `migrations/` and prints the file to commit. `plumix migrate`, `plumix migrate fresh` and Cloudflare's `plumix deploy` never write a migration: when the site's own tables are ahead of its `migrations/` they fail with `migrate_site_drifted` before changing anything, and say to run `plumix migrate generate` or `plumix dev` and commit the result. `plumix build` on Node and Bun copies every owner's history beside the server as `dist/server/migrations/<owner>/`. `plumix/cli` adds `migrateBeforeDeploy`, `applyBuiltMigrations` and `copyOwnerHistories` for runtime adapters, and `RuntimeMigrations.open` now receives the site's `config` in place of the built `app`.
