---
"@plumix/runtime-cloudflare": minor
---

Adds a `cloudflare()` CDN provider on `@plumix/runtime-cloudflare/cdn` that takes the same options as `plumix/cdn/cloudflare` and also purges Cloudflare's Workers Caching on publish and after a sync, so a Worker with `"cache": { "enabled": true }` no longer serves stale pages. The build and `plumix dev` read `cache.enabled` from your wrangler config. A refused Workers Caching purge is logged, and the publish still succeeds. The scaffolded `wrangler.jsonc` now turns Workers Caching on and the scaffolded config wires this provider as `cdn:`; set `CF_ZONE_ID` and `CF_CACHE_PURGE_TOKEN` to switch it on.
