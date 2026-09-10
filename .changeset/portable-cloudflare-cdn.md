---
"plumix": minor
"@plumix/core": minor
"@plumix/runtime-cloudflare": minor
---

**Breaking:** `edge()` and `EdgeConfig` are gone from `@plumix/runtime-cloudflare`.
The Cloudflare CDN provider now ships from core as `cloudflare()` behind
`plumix/cdn/cloudflare`, so a site hosted anywhere — a container, a droplet, a
VM — can put Cloudflare in front of it and have its public pages cached at the
edge, with publishing purging them. It has no dependencies (header writes and
one authenticated request), so a container deploy no longer pulls a Workers
toolchain into its image to get edge caching. On Workers it additionally uses
the Cache API when it finds one; which mechanism is in play never appears in
configuration. The `cdn:` line is now the one line in a site's configuration
that does not change when the site moves hosts.

The zone id and purge token are required provider config taking `(env) =>`
resolvers, rather than `CF_ZONE_ID` and `CF_CACHE_PURGE_TOKEN` read implicitly
from the environment: the requirement is visible and type-checked while the
secret stays out of the committed file. With either credential resolving to
nothing the provider is inert — nothing is decorated, nothing is stored — and
silent at startup, since nothing cached means nothing can go stale; the debug
bar's slot row is where that shows. A purge the zone _rejects_ is what logs at
error level, and it never fails the publish.

Providers export their bare vendor name, so alias the import — every provider
then aliases to the same word and swapping vendors later is a one-word edit.

```diff
-import { edge } from "@plumix/runtime-cloudflare";
+import { cloudflare as cdn } from "plumix/cdn/cloudflare";

 export default definePlumixConfig({
-  cdn: edge({ ttl: 3600, staleWhileRevalidate: 86400 }),
+  cdn: cdn({
+    ttl: 3600,
+    staleWhileRevalidate: 86400,
+    zoneId: (env) => env.CF_ZONE_ID,
+    purgeToken: (env) => env.CF_CACHE_PURGE_TOKEN,
+  }),
 });
```
