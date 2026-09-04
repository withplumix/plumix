---
"plumix": minor
"@plumix/runtime-cloudflare": patch
---

Adds a runtime-neutral e2e harness to `plumix/test/playwright`. `definePlumixE2EConfig` takes `configDir` (pass `import.meta.dirname`) beside `playground`, reads the `plumix.e2e` block of the runtime package the playground depends on for the state to wipe and where the database lives, and applies migrations through `plumix migrate apply` instead of naming wrangler; `openPlaygroundDb` resolves the database through the same block and drops its unused `binding` option. Adds `runtimeSpec`, the one spec every runtime playground runs (bootstrap the first admin with a passkey, publish an entry, read it publicly, upload media, sign out), plus the `CONTENT_LIST_ROWS` and `PNG_1X1` fixtures the plugin suites share. The Cloudflare runtime declares its block and ships a playground that runs the spec.
