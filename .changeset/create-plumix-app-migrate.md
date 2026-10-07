---
"create-plumix-app": minor
---

Sets up the local database with `plumix migrate` in place of `migrate generate` and `migrate apply`. Its next steps print `pnpm dev` and no migration command, and the Cloudflare `wrangler.jsonc` no longer sets `migrations_dir`.
