---
"@plumix/runtime-cloudflare": minor
---

Adds `--production`, `--preview` and `--env <name>` to `plumix migrate` on Cloudflare, resolved from the wrangler config with wrangler's own reader, so a site can migrate a wrangler environment's database or its Worker Previews database. Adds `plumix preview`, which builds, migrates the Previews database and runs `wrangler preview`. `plumix deploy` now builds the Worker first and takes `--env <name>`. `plumix doctor` lists every D1 database a target can reach. Fixes remote migrations reaching a binding's `preview_database_id` instead of its `database_id`. Requires `plumix` 0.26.
