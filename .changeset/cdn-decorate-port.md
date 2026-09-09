---
"plumix": minor
"@plumix/runtime-cloudflare": minor
---

Public pages now leave the origin carrying their freshness and cache tags, so a
site behind a CDN it does not write to gets edge caching for the first time.
`ConnectedCdn` is reshaped around that: `decorate(response, tags)` is the only
member every provider implements, and `store`, `purgeTags` and `segmentVary`
are all optional — a vendor that cannot invalidate by tag has no `purgeTags` at
all rather than one that quietly does nothing. Decoration may narrow sharing and
never widen it: a handler's own shared-cacheable `cache-control` is preserved, a
response marked `private`/`no-store` or carrying a `Set-Cookie` is returned
untouched and untagged, and the site's page freshness is stamped only where the
response declared none.

Because a public page now leaves carrying `s-maxage`, `d1()` no longer appends
its read-your-writes bookmark cookie to a response that declares itself
shared-cacheable — a policy granting `anonymous` to a signed-in visitor would
otherwise let the CDN hand one reader's bookmark to everyone.

Cache tags are lowercased wherever one enters the system: the `typeTag` /
`entryTag` constructors, a plugin's own `tagCdnEntry`, and the purge
accumulator. The `cdn` telemetry fact records whether an origin store was in
play, and a non-anonymous audience segment bypasses a provider that cannot
separate segments, recorded as `segment-unsupported`.

`describeCdnContract` from `plumix/test/conformance` now
takes the optional members a provider ships (`store`, `purgeTags`) and runs the
cases that apply. `edge()` from `@plumix/runtime-cloudflare` implements the new
port with its Workers Cache API store intact.

```diff
 const cdn: ConnectedCdn = {
-  match: (request) => store.match(request),
-  put: (request, response, tags) => store.put(request, response, tags),
-  purgeTags: (tags) => purge(tags),
+  decorate: (response, tags) => stampFreshnessAndTags(response, tags),
+  store: { match, put },
+  purgeTags: (tags) => purge(tags),
 };
```
