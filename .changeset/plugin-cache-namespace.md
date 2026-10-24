---
"plumix": minor
---

Adds `ctx.cache.reads(key?)` and `ctx.cache.changed(key?)`, which store and purge a plugin's own data under a namespace core names after the calling plugin, so two plugins using the same key never purge each other's pages.
