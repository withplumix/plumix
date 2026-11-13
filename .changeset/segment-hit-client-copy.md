---
"@plumix/core": patch
---

Fixes a member's cached page leaving as publicly cacheable on a CDN hit, and gives uncached public pages an explicit `private, no-cache`.
