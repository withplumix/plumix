---
"@plumix/runtime-cloudflare": minor
---

Fixes Workers Caching serving the anonymous page to signed-in visitors and keeping pages a publish should have purged. The generated Worker's default entrypoint is now an uncached gateway: it hands a GET or HEAD from a visitor with no session, with every cookie and marketing parameter removed, to a cached `PlumixSharedCache` entrypoint, and renders everyone else live. Every Workers Caching purge now runs inside that entrypoint, and a refused one is recorded on the request's `cdn` telemetry.

**Breaking:** `plumix build` and `plumix dev` now fail when Workers Caching sits in front of the default entrypoint. To migrate, keep `"cache": { "enabled": true }` in `wrangler.jsonc` and add, beside it (Wrangler 4.107 or later):

```jsonc
"exports": {
  "default": { "type": "worker", "cache": { "enabled": false } },
  "PlumixSharedCache": { "type": "worker", "cache": { "enabled": true } },
},
```

A cached page must not set cookies, since `Set-Cookie` makes Workers Caching bypass it.
