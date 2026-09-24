---
"plumix": minor
---

Adds `publicEntryRows` to `plumix/db`, the rule every archive's entry query starts from, for a surface that compiles an archive's query outside core's listing reader. Adds `ListingArchiveTypeOptions` and `UnlistedArchiveTypeOptions` as augmentation targets on `plumix`, so a plugin can add an archive option only an archive with `entries` accepts. Adds `publicRouteAt` to `plumix/plugin`, which answers which public route the dispatcher serves a path with. `ctx.resolvedRoute` now carries the matched route's `intent`, so a render-time reader knows which archive or entry type the page is without matching the path again.
