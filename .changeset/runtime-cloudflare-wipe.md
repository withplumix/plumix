---
"@plumix/runtime-cloudflare": minor
---

Makes `plumix migrate fresh` on Cloudflare drop every table in the local D1, or in the `--preview` or `--env <name>` database, and print that database's D1 Time Travel bookmark and the `wrangler d1 time-travel restore` command before dropping anything.
