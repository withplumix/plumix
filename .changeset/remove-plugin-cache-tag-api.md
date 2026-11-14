---
"plumix": minor
---

Removes the plugin-facing cache tag API: core now derives a response's tags from what it read through core and purges from what was written through core. `tagCdnEntry` is gone from `plumix/plugin`: read core's content through its read helpers (`compileEntryQuery`, `taxonomyTermRows`, lookups) to tag a response, or call `ctx.cache.reads(key?)` for your plugin's own data. `enqueuePurgeTags`, `entryTag`, `typeTag`, `entryPurgeTags` and `termPurgeTags` are gone from `plumix/db`: write entries, terms and settings through `ctx.entries`, `ctx.terms` and `ctx.settings.write`, which purge for you, and call `ctx.cache.changed(key?)` when your plugin's own data changes. `LookupAdapter.embeddedCacheTags` is gone: set the adapter's `kind` (`"entry"`, `"term"` or `"user"`) and core tags every id it hydrates.
