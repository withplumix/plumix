---
"plumix": minor
---

Fixes a request reading stale data after its own write. A request (or one scheduled run) that hydrates a reference, reads an entry's type, an author, a term or author path lookup, or a settings group, and then writes it, now reads the written row. Before, it got the copy loaded before the write. Ids that hydrated to nothing are re-queried once a write in the same request publishes them. The lifecycle actions a write already fires (`entry:*`, `term:*`, `user:*`, `settings:group_changed`) drive this, with or without a `cdn` slot. `ctx.memo(key, load, tags?)` takes cache tags and gains `ctx.memo.invalidate(tags)`. `enqueuePurgeTags` also drops the memo entries carrying those tags, and `memoBatch` takes an optional `tagsFor(id)`.

**Breaking:** `LookupAdapter.embeddedCacheTags` now receives the referenced id (`embeddedCacheTags(id: string)`), not the hydrated payload. Return the tag your entity's purge enqueues, computed from the id.
