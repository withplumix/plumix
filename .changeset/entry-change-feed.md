---
"@plumix/core": minor
"@plumix/runtime-cloudflare": patch
"plumix": minor
---

Adds an entry change feed — a durable record of which entries changed.

Nothing recorded which entries had changed. A consumer that needs to know could only subscribe to
the `entry:*` lifecycle actions, which miss every write that bypasses the application: seeds,
migrations, direct-write tooling, bulk imports. An `entry_changes` table now carries one row per
change, appended by triggers on `entries` so no writer can bypass it. Only a change to title,
content, excerpt or status enqueues, so a metadata-only save records nothing; a deletion enqueues a
tombstone, because the entry it names is gone by the time a consumer reads it.

`readEntryChanges(db, limit)` returns the oldest pending changes and `ackEntryChanges(db, changes)`
drops the ones a consumer has finished with. Both accesses are primary-key ordered, so draining
tracks the batch rather than the corpus, and acknowledging after the work rather than before leaves
an isolate that dies mid-drain its batch for the next one. Nothing in core drains the feed yet —
the first consumer is the search plugin.

`plumix migrate generate` emits core's DDL ahead of every plugin's, since the objects it creates sit
on core's own tables. The demo sandbox's statement splitter now keeps a trigger body whole: it split
on every semicolon outside a quoted span, which would have cut the first trigger to reach it into
fragments.
