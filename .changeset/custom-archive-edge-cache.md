---
"@plumix/core": minor
---

Let custom archives opt into the edge cache and contribute cache tags.

`registerArchiveType` now accepts a `cacheable` flag, and a custom-archive resolver's
`CustomArchiveResolution` may return `tags`. When `cacheable` is set, a `custom`
route's anonymous GET renders participate in the built-in edge cache instead of
rendering live on every request, and the resolver's `tags` are stored on the response
so a publish of the listed types purges the archive — the same coarse, publish-driven
invalidation the built-in entry, taxonomy, and front-page archives already get.
Previously `custom` intents bypassed the Workers Cache API entirely and carried no
tags, so faceted or rollup archives that the built-in taxonomy archive can't express
lost edge caching and tag-based purge.

The two knobs are split deliberately: the cache gate runs before render, so the opt-in
(`cacheable`) must be static, while `tags` are consumed only at store time and ride on
the resolution. Both default off and no-op safely on their own — `tags` without
`cacheable` never caches; `cacheable` without `tags` caches under `s-maxage` alone.
Tags flow through the existing embedded-reference tag accumulator, and the pure cache
decision layer stays free of the archive-type registry lookup.
