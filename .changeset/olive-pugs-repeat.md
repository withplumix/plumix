---
"@plumix/core": minor
"@plumix/runtime-node": patch
"plumix": patch
---

Release the database connections a scheduled run opens

`plumix cron run` opened database connections and never released them. A
one-shot process exits only when its event loop drains and a remote libsql
client holds a live socket until it is closed, so a Kubernetes CronJob pod could
keep running long after its work finished — and with `concurrencyPolicy: Forbid`
that blocks the next firing too.

`DatabaseAdapter.connect` may now return a `close()` alongside its `db`, so a
connection is released through the seam that created it. `nodeSqlite` and
`plumix/db/libsql` provide one; D1 does not, having a binding rather than a
connection. `createPlumixHandler` releases the connection it bound as part of
`dispose()`, after the drain — deferred work is querying through it until then —
and `plumix cron run` drains the handler and then releases the guard's own.

The long-lived Node scheduler keeps its connection: the next firing uses it.
