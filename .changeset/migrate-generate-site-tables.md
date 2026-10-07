---
"plumix": minor
---

`plumix migrate generate` now generates only the site's own tables, those declared by a plugin whose `schemaModule` resolves inside the site's package. It writes `.plumix/site-schema.ts` and their history to the site's `migrations/`, never diffs core's or a package's tables, and says so and writes nothing when the site owns no tables. Removes `sqlMigrations` from `definePlugin` and `PluginDescriptor`, and the `RawSqlMigration` type: DDL drizzle cannot express goes in a hand-written migration in the plugin's own history (`drizzle-kit generate --custom`). When drizzle-kit needs a rename answered without a terminal, the failure says to run `plumix migrate generate` in an interactive terminal and no longer suggests deleting anything, and an adoption that fails on a site table with no migration says to run `plumix migrate generate`.
