---
"plumix": minor
---

`createDispatcherHarness` takes a `db` option so a caller can supply its own drizzle database — the seam a runtime package uses to run core's request-level tests over its driver. Without it the harness creates its in-memory libsql database as before. `applyTestSchema` accepts any drizzle SQLite db, sync or async.
