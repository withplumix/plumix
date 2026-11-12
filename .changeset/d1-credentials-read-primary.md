---
"@plumix/runtime-cloudflare": patch
"@plumix/core": patch
---

Validates sessions and API tokens against the D1 primary when read replication is on (`session: "auto"` or `"primary-first"`). Other reads keep their replica routing.
