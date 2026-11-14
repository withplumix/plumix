---
"plumix": minor
---

Adds `frontCache` to a connected CDN: a cache in front of the app in the same deploy, which a signed-in reader's universal copy is read from. A response to a request it forwarded keeps the universal marker, and `withoutUniversalMarker` from `plumix/runtime` strips it.
