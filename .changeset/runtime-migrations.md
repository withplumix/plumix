---
"@plumix/runtime-cloudflare": minor
"@plumix/runtime-node": minor
"@plumix/runtime-bun": minor
---

Supports the new `plumix migrate`, which applies core's and each plugin's shipped migrations, and removes `plumix migrate apply`. On Cloudflare it opens the site's D1 binding through wrangler's `getPlatformProxy`: the local database `plumix dev` uses, or the deployed one with `--remote`. Pass `--binding <name>` when the wrangler config declares several D1 databases. It no longer runs `wrangler d1 migrations apply`, so `migrations_dir` is no longer needed. On Node and Bun it opens the configured SQLite file, and `--remote` is an error. The Bun scaffold's `migrate:apply` script is now `migrate`.
