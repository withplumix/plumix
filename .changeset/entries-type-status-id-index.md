---
"plumix": patch
---

Adds a migration with an `entries_type_status_id_idx` index on `(type, status, id, published_at, updated_at)`, so a query that pages one type's published entries in id order reads them through the index instead of sorting them, and one that needs only their publish and modification times never reads the rows. Run `plumix migrate` to apply it.
