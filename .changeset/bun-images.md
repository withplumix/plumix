---
"@plumix/runtime-bun": minor
---

Adds `images({ widths, remotePatterns, cacheDir })`, the image-delivery slot on `Bun.Image`. It serves resized images from `/_plumix/image` and picks the format from `Accept` among what the host can encode, so on Linux, which has no AVIF encoder, a browser asking for AVIF gets WebP. Variants are cached on disk and answer `If-None-Match` with 304. A Bun project scaffolded with the media plugin now gets `imageDelivery: images()`.
