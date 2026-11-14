---
"plumix": minor
---

Fixes a cached plugin page that reads one entry staying stale after that entry changes: `readEntryType` (`plumix/plugin`) and `loadAuthoredEntry` (`plumix/db`) now tag the response with the entry they find, so an edit to it purges the page. `loadAuthoredEntry` takes the context instead of its database: call `loadAuthoredEntry(ctx, id)` where you called `loadAuthoredEntry(ctx.db, id)`.
