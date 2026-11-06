---
"plumix": minor
"@plumix/plugin-audit-log": patch
"@plumix/plugin-comments": patch
"@plumix/plugin-feeds": patch
"@plumix/plugin-forms": patch
"@plumix/plugin-media": patch
"@plumix/plugin-menu": patch
"@plumix/plugin-search": patch
"@plumix/runtime-bun": patch
"@plumix/runtime-node": patch
"@plumix/runtime-cloudflare": patch
---

Reads every current time in core, the first-party plugins and the runtimes through `now()`, so a test site's `site.travel` and `site.freezeTime` now move token and invite expiry, edit leases, retention cutoffs, rate-limit windows and `updatedAt` stamps too. A column's SQL `unixepoch()` default, such as `createdAt`, still stamps real time.
