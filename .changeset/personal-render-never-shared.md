---
"@plumix/core": patch
---

Fixes a member's page being served to every other member of a shared audience segment when its render read the principal. A render that reads `ctx.user`, `ctx.tokenScopes` or `ctx.auth.can()`, calls `useUser()`, shows the admin bar, or resolves to the member's own locale is personal: it is no longer stored in the segment's CDN entry, leaves as `private, no-store`, and the `cdn` telemetry record carries `personal: true`.
