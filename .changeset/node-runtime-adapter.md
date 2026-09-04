---
"@plumix/runtime-node": minor
---

Adds the `node()` runtime adapter and `plumix build` for Node. The adapter wraps core's handler and serves `dist/client` as the assets binding, so admin deep links resolve; `build` writes `dist/client` and `dist/server/worker.js`, client first, inlining everything but `sharp`, `better-sqlite3`, the libsql client family and whatever `build.external` names. The generated entry keeps the portable `{ fetch, scheduled }` default export, exports a Connect-style `listener` for embedding, and when run directly listens on `PORT` and `HOST`, drains deferred work on `SIGTERM` or `SIGINT`, and exits 1 after ten seconds naming what it abandoned.
