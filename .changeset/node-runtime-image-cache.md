---
"@plumix/runtime-node": minor
---

`images()` bounds its cache. `cacheSize` (1 GiB by default) caps the bytes under `cacheDir`; past it, the variant served longest ago is dropped, and a restart starts from the order the files were written in. Renders run at most one per core at a time, with the rest waiting, so a burst of first views cannot hold every source in memory together. The slot gains `purge(sourceUrl)`, which forgets every variant of one source whatever query it was requested with; the media plugin calls it when an item is trashed or deleted, so a variant no longer outlives its source's gating.
