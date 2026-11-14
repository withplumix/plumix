---
"plumix": minor
---

Adds drizzle's SQLite table builders to `plumix/db` (`sqliteTable`, `index`, `uniqueIndex`, `primaryKey`, `foreignKey`, `unique`, `check`, `integer`, `text`, `real`, `blob`, `numeric`), taken from the same drizzle instance core builds its own tables with, so a site's or plugin's own schema module imports its tables' builders from Plumix instead of `drizzle-orm/sqlite-core`.
