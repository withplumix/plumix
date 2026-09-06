---
"@plumix/runtime-node": minor
"plumix": minor
---

Queries through the `node:sqlite` shim now record `db: <kind>` spans, so a Node
site's debug bar lists its SQL and telemetry consumers see the same query
tree the libsql and D1 adapters produce. `traceDbQuerySync` is the new core
helper behind it — the synchronous twin of `traceDbQuery`, for a driver whose
statement API returns rows rather than a promise. `createTracedContext` gains a
`dbSpans()` reader alongside its `dbQueryCount()`.
