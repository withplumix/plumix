---
"@plumix/core": patch
---

Keeps revisions and autosaves off the entry change feed.

Revisions and autosaves are rows in `entries` under reserved types, so the feed's triggers recorded
them alongside real content. Three consequences: an autosave rewrote a feed row on every debounced
save in the editor, pruning a revision past `maxRevisions` emitted a spurious tombstone, and the id
on those rows is a snapshot's rather than a document's — a consumer resolving one would have read
back a revision, or indexed an unpublished autosave draft.

The triggers now skip reserved types. Filtering there rather than in each consumer is what makes the
tombstones right: a tombstone carries only an id, and once the row is gone nothing downstream can
tell a pruned revision from a deleted entry.

Existing installs pick this up through a second migration — a migration the journal already carries
is never re-emitted, so correcting the first one takes a new one. Run `plumix migrate generate`.
