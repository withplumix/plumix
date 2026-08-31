---
"@plumix/core": patch
---

Corrects which entry writes reach the change feed.

Revisions and autosaves are rows in `entries` under reserved types, so the feed's triggers recorded
them alongside real content. An autosave rewrote a feed row on every debounced save in the editor,
pruning a revision past `maxRevisions` emitted a spurious tombstone, and the id on those rows is a
snapshot's rather than a document's — a consumer resolving one would have read back a revision, or
indexed an unpublished autosave draft. The triggers now skip reserved types. Filtering there rather
than in each consumer is what makes the tombstones right: a tombstone carries only an id, and once
the row is gone nothing downstream can tell a pruned revision from a deleted entry.

The guard also watches `type`, `slug` and `parent_id` now, alongside title, content, excerpt and
status. Those three decide an entry's permalink, its template, and whether search indexes it at all,
so a retype or a slug rename left every consumer holding a projection it had no way to know was
stale. One consequence worth knowing: `parent_id` is `on delete set null`, so deleting a parent
re-roots its children and each of them is recorded — a URL change the application never writes.

Existing installs pick this up through a second migration — a migration the journal already carries
is never re-emitted, so correcting the first one takes a new one. Run `plumix migrate generate`.
