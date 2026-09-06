---
"@plumix/runtime-node": patch
---

`nodeSqlite()` binds a boolean interpolated into a raw `sql` template as 0/1 and a `Date` as epoch milliseconds, the way libsql does. `node:sqlite` binds neither on its own, so a template that runs on `plumix/db/libsql` now runs on Node as well.
