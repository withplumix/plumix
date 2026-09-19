---
"plumix": minor
"@plumix/plugin-media": minor
---

Adds an optional `image(payload)` method to the lookup adapter contract. It returns a `ResolvedImage` (`url`, `alt`, and `width`/`height` as a pair or not at all), or `null` when the payload is not a usable image. `ResolvedImage` is exported from `plumix/plugin` and the root `plumix` types. The media adapter implements it: an image row resolves to its URL, alt text and measured size; a non-image row or one with no URL resolves to `null`.
