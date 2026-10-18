---
"@plumix/runtime-bun": minor
---

Adds `plumix migrate fresh` on Bun: it drops every table in the SQLite file `bunSqlite()` names, with foreign keys off, instead of deleting the `data` folder.
