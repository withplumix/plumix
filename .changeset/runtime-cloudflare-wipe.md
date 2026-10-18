---
"@plumix/runtime-cloudflare": minor
---

Adds `plumix migrate fresh` on Cloudflare: it drops every table in the local D1, or in the `--preview` or `--env <name>` database, and prints that database's D1 Time Travel bookmark and the `wrangler d1 time-travel restore` command before it drops anything.
