---
"plumix": minor
---

Lists the front page, entry-type, term, author and date archives through one entry query each. Term pages now list the term's entries of every public type when a taxonomy declares no `entryTypes`, where they used to list nothing, and never list an entry of a non-public type, even one the taxonomy names. Adds `archiveAtPath` and `archiveBaseRoutes` to `plumix/plugin`, which say which archive owns a URL along with its entry query, and list every archive's unpaginated routes. A term query's `inTerm` now finds a nested term of a taxonomy with flat URLs by its slug alone, the path its page sits at.
