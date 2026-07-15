---
"@plumix/runtime-cloudflare": patch
---

Fix Cloudflare deploys failing with `The "legacy_env" field is no longer
supported`. `@cloudflare/vite-plugin` is bumped to ^1.45.0, which builds the
worker config with wrangler 4.111 — matching the wrangler the deploy step runs
— so the generated `dist/*/wrangler.json` no longer emits the removed
`legacy_env` field. Builds on wrangler 4.110 produced a config the newer deploy
wrangler rejected.
