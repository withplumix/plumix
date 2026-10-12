---
"@plumix/plugin-search": minor
---

Adds entries of types with an `access` policy to search, each result listed only to a searcher who may see it and a soft-gated entry's snippet kept to its excerpt. Start one rebuild at `/_plumix/search/reindex` after upgrading, so entries of a policied type already in the database become findable.
