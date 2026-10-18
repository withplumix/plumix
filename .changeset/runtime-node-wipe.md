---
"@plumix/runtime-node": minor
---

Adds `plumix migrate fresh` on Node: it drops every table in the SQLite file `nodeSqlite()` names, with foreign keys off, instead of deleting the `data` folder.
