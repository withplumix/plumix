---
"plumix": minor
---

Adds a `slug` to the `entry` route intent, so `registerRewriteRule("/compare/:id", { kind: "entry", entryType: "page", slug: "shared-comparison" })` serves that one entry at a dynamic path and its block loaders read `id` from `ctx.resolvedRoute.params`. Preview links, edit mode and per-entry access work there as they do at the entry's permalink.
