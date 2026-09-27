---
"plumix": minor
---

Adds `context.t(descriptor, values?)` to a block's render context, which resolves a `{ id, message }` descriptor against the active locale's catalog — on the public route, in edit-mode SSR and in the editor canvas alike. The canvas now renders at the author's locale instead of always English. Core blocks' render strings (the embed placeholder, its untitled fallback and its "Load embed" label, and the canvas's "Add a block") are localized, and `@plumix/blocks` ships its own catalog under `./locales/*`. Removes the `addBlockLabel` option from `renderBlockTree`, and `editAppender` now takes the render context's `t` as its first argument; pass `catalog` (and `locale`) to `renderBlockTree` instead. A custom runtime adapter's generated entry should import `virtual:plumix/plugin-catalogs` and pass it to `buildApp` as `pluginCatalogs`, or plugin block strings render in English.
