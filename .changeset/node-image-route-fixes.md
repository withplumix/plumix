---
"plumix": minor
"@plumix/runtime-node": patch
---

The Node `images()` route now matches `basePath`: `ImageDelivery.connect()` receives the site's resolved base path so `url()` prefixes `/_plumix/image` the way every other outbound URL is prefixed, and the pre-handler layer matches requests against the same prefixed route. A site served under a subdirectory, behind a proxy that forwards only that subdirectory, now reaches the route.

Two smaller gaps close alongside it: rendering passes `{ animated: true }` to `sharp`, so an animated GIF or WebP source keeps its frames through a resize instead of losing them to the first one; and `Accept` negotiation now parses `q` values instead of doing a substring match, so `image/avif;q=0` no longer selects AVIF.
