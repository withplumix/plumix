---
"plumix": minor
---

Adds `ctx.cache.reads(key?)` and `ctx.cache.changed(key?)` for a plugin's own data. `reads` stores the current response under the key, or under all of the plugin's data without one, and `changed` purges every response that read it, or with no key everything the plugin declared, and drops it from the request memo at once. Core names the namespace after the calling plugin, so two plugins using the same key never purge each other's pages.
