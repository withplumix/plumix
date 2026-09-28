---
"plumix": minor
---

Adds `describeDatabaseContract` to `plumix/test/conformance`. It holds a `database:` adapter to what core's queries assume of every driver: snake_case columns, `returning`, joins and relational queries, exact `rowsAffected` on a table with triggers, raw `sql` Date and boolean binding, foreign-key cascades, and a generated migration set that keeps the change-feed triggers.
