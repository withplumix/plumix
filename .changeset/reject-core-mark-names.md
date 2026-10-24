---
"@plumix/core": patch
---

Fixes `ctx.registerMark` accepting a core mark's name such as `bold` or `highlight`: a plugin mark that reuses a core mark name now throws at setup. Name plugin marks `pluginId/markName`.
