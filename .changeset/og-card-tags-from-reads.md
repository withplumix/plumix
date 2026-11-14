---
"@plumix/plugin-og": patch
---

Stores a plugin archive's card under what resolving its page read, so an archive whose `resolve` reads through `ctx.cache.reads` or `compileEntryQuery` has its card retired by the same write that retires the page.
