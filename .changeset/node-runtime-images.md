---
"@plumix/runtime-node": minor
---

Adds `images({ widths, remotePatterns, cacheDir })`, the `imageDelivery` slot on Node. `url()` is URL math onto `/_plumix/image`, which the entry and `plumix dev` serve ahead of the site through `sharp`, an optional peer loaded in `connect` and named by a clear error when missing. A same-origin source is resolved through the site's own `fetch` as an anonymous GET, so the media plugin's gating applies; a remote source must match `remotePatterns`, every redirect is re-checked with ten hops at most, sources are capped at 32 MiB and fifteen seconds, and anything else is 400. Widths snap to the roster, quality is clamped, and the format is negotiated from `Accept` to AVIF, WebP or the source's own. Variants are cached on disk under a hash of the request with an immutable cache header and answer 304 on `If-None-Match`. The scaffold's Node `imageDelivery` capability wires `images()` and installs `sharp`, so the media plugin is offered on Node.
