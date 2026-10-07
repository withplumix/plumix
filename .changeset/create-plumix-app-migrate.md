---
"create-plumix-app": minor
---

Sets up the local database with `plumix migrate` in place of `migrate generate` and `migrate apply`. The next steps print only `pnpm dev` once that has run, and the Cloudflare `wrangler.jsonc` no longer sets `migrations_dir`.
