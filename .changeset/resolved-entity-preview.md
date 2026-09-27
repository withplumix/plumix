---
"plumix": minor
---

Adds `preview` to the entry arm of `ctx.resolvedEntity` (and to the renderer's `useQueriedEntry()`), true when a preview link's autosave was overlaid onto the entry being rendered. The dispatcher test harness gains `mintPreviewToken({ entryId, userId })` for rendering a page through a preview link.
