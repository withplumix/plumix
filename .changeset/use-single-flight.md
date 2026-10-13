---
"plumix": minor
---

Adds `useSingleFlight` to `plumix/blocks/renderer`: wrap an island's submit or load-more handler, and a second press while the first request is still pending is ignored.
