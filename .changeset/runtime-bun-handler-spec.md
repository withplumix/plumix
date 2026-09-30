---
"@plumix/runtime-bun": minor
---

Moves the Bun adapter to the `handler` spec, and has the site build its handler with `createRuntimeHandler(app)`. Assets and the drain deadline behave as before. Requires the `plumix` release that adds `createRuntimeHandler`.
