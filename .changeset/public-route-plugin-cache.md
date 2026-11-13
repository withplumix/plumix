---
"plumix": patch
---

Fixes `ctx.cache.reads` and `ctx.cache.changed` throwing inside a handler registered with `registerPublicRoute`: a public route now runs as its plugin, like every other plugin route.
