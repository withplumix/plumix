---
"plumix": patch
---

Fixes the entry and term reference-field lookups (`list`/`hydrate`) to build every result's permalink in one batched query instead of one query per hierarchical row.
