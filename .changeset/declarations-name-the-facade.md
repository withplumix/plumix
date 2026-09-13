---
"plumix": patch
"@plumix/plugin-audit-log": patch
"@plumix/plugin-comments": patch
"@plumix/plugin-forms": patch
"@plumix/plugin-media": patch
"@plumix/plugin-og": patch
"@plumix/plugin-pages": patch
"@plumix/plugin-seo": patch
---

Fixes published type declarations that imported `@plumix/core` or `@plumix/blocks`, packages a consumer does not depend on, so the affected types resolved to nothing. `pages`, `fileBlock` and `imageBlock` now name their types through `plumix/plugin` and `plumix/blocks`, and the RPC routers of audit-log, comments, forms, og and seo name the default database schema as `CoreSchema` from `plumix` instead of through `@plumix/core/schema`.
