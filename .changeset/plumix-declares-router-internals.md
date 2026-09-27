---
"plumix": patch
---

Declares `@tanstack/router-core` and `@tanstack/history`, which `plumix/admin/react-router`'s emitted types already referenced. A consumer on a strict node_modules layout could not resolve them, so typechecking against the published surface failed on types it was handed.
