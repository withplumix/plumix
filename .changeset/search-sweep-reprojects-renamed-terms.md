---
"@plumix/plugin-search": patch
---

Fixes the scheduled search run never re-indexing a term renamed or re-described straight in the database: such a term is now found by its new name and description after the next run, instead of matching its old text until it is edited or the index is rebuilt.
