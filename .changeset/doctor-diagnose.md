---
"plumix": minor
---

Adds deploy checks to `plumix doctor`: a runtime's commands module can export `diagnose`, and doctor prints each `ok` or `warn` finding it returns, with the fix for a warning. Also adds `createJsonLogger` to `plumix/runtime`, and a `logger` option to `createRuntimeHandler` that sets what `ctx.logger` writes to.
