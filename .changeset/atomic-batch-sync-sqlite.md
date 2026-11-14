---
"@plumix/runtime-node": patch
"@plumix/runtime-bun": patch
---

Fixes a batch of writes on the `nodeSqlite` and `bunSqlite` databases leaving its earlier statements committed when a later one fails. The batch now commits all of its statements or none, as it does on D1 and libSQL, so a failed email change no longer keeps the old sessions alive.
