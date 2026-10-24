---
"plumix": minor
---

Adds `taxonomyTermRows(ctx, taxonomy)` to `plumix/db`, the rows of a taxonomy's terms for a response that lists them. A response built on it is purged when a term is created in that taxonomy or deleted from it, whether or not the taxonomy lists entry types. Creating or deleting a term now purges the pages that showed it and those lists, not every page of the entry types its taxonomy lists. A read through `anonymousContext` now tags the response it was made for.
