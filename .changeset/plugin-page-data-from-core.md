---
"plumix": minor
---

Adds `resolveEntryData(ctx, row)` and `resolveEntryList(ctx, rows)` to `plumix/plugin`, so a plugin gets one entry's page data from the same call core's own single-entry route makes, with `resolve:single:data` applied and title shortcodes expanded. Entry titles on archives, term, author and date listings now expand shortcodes such as `[year]`. **Breaking:** removes `buildResolvedEntries` from `plumix/plugin`. Call `resolveEntryList` for a batch of rows, or `resolveEntryData` for one entry's page data.
