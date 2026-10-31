---
"plumix": patch
---

Fixes `plumix dev` ignoring edits to a `plumix.config.mjs`, or to a `plumix.config.js` in a `"type": "module"` package, until a restart: the dev server now reloads them like a `plumix.config.ts`.
