---
"@plumix/plugin-search": patch
---

Drops its `sqlMigrations` declaration. The FTS5 index and its triggers come from the migration history the package ships, which `plumix migrate` applies.
