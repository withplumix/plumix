---
"plumix": minor
"@plumix/runtime-cloudflare": minor
---

**Breaking:** the `cache:` config slot is renamed `cdn:`. `CacheProvider` and `ConnectedCache` are renamed `CdnProvider` and `ConnectedCdn`, `ctx.cache` is renamed `ctx.cdn`, `tagCacheEntry` is renamed `tagCdnEntry`, and `describeCacheContract`/`CacheContractOptions` from `plumix/test/conformance` are renamed `describeCdnContract`/`CdnContractOptions`. No behavior change — `edge()` from `@plumix/runtime-cloudflare` keeps doing exactly what it did before, under the new name.

```diff
 export default plumix({
-  cache: edge({ ttl: 3600 }),
+  cdn: edge({ ttl: 3600 }),
 });
```
