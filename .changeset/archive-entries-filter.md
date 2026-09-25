---
"plumix": minor
---

Adds the `archive:entries` filter, which hands any archive's entry query — the front page, an entry type, a term, author or date archive, or a plugin archive with `entries` — to a plugin to narrow, along with the archive it describes and what its URL captured. It runs wherever the archive's query is read, so the page, its pagination and its feed change together; a query only narrows and core reapplies the public-entries rule, so a handler can hide entries but never reveal one. `archiveAtPath` now takes the app context (`{ plugins, hooks }`) rather than the plugin registry, so the query it returns is the narrowed one; the new `ArchiveReader` type names that argument.
