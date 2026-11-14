---
"plumix": patch
---

Adds a migration that speeds up term-filtered entry queries (term archives, term-filtered lists and counts): `entry_term_term_id_idx` now covers `(term_id, entry_id)`, so finding a term's entries reads the index alone. Run `plumix migrate` to apply it.
