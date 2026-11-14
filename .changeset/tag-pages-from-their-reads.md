---
"plumix": minor
---

Stores a plugin archive, a cacheable view and a contributed sitemap source under what their handler read. `compileEntryQuery` now tags the response with each entry type its query can list (every public type for a query that names none), including through `anonymousContext`, and an archive's or view's `resolve` can call `ctx.cache.reads`. Removes `CustomArchiveResolution.tags`, `ViewResolution.tags` and `ResolvedArchiveTypePage.tags`: drop the `tags` your `resolve` returned, and read entries through `compileEntryQuery` or your own data through `ctx.cache.reads` instead.
