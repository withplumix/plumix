---
"plumix": minor
"@plumix/runtime-node": minor
"@plumix/runtime-bun": minor
"@plumix/runtime-cloudflare": minor
---

Adds data migrations: forward-only TypeScript steps built with `defineDataMigration` from `plumix/db`, which core, a plugin (through `dataMigrations` on its descriptor, with or without tables) or the site (through `dataMigrations` in `plumix.config.ts`) declare. They run after every schema migration in `plumix dev`, `plumix migrate`, `plumix deploy` and a built Node or Bun server's start, are recorded per owner and name in `__plumix_data_migrations`, and show in `plumix migrate status`. `plumix build` on Node and Bun writes them to `dist/server/migrations/data-migrations.js`, beside the server and outside it. Each runtime's `MigrationDatabase` now carries `drizzle`.
