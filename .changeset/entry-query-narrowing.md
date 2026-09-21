---
"plumix": minor
---

Adds `entryQuery()` and `compileEntryQuery()` to `plumix/db`: a description of a set of entries built by narrowing (`ofTypes`, `inTerm`, `byAuthor`, `inDateRange`, `under`, `where`, `none`) rather than written as SQL. A surface can hand one to a plugin already restricted to what it may show, and the plugin can only add conditions to it.
