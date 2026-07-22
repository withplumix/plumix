---
"@plumix/core": minor
---

Telemetry now covers the remaining span-tree interiors and platform I/O slots. The `render` phase gains child spans for its previously invisible tail: `render: deps` (template-dep loaders), `render: head` (SEO gap-fillers), `render: loaders` (block loader prefetch), and `render: react` (the `renderToString` pass) — error-page renders included. The platform I/O slots are wrapped once at context assembly, mirroring `ctx.fetch`: `cache: match`/`cache: put`, `assets: fetch`, `storage: put|get|head|delete|list`, and `mailer: send` spans now appear for every consumer. Note `ctx.assets`/`ctx.storage`/`ctx.cache`/`ctx.mailer` are no longer the configured objects by identity — they are interface-preserving traced wrappers, so code stashing extra properties on a custom slot object and reading them back off `ctx` must keep a direct reference instead. Span coverage and deliberate exclusions are documented in `docs/telemetry.md`.
