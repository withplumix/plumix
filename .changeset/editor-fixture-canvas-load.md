---
"plumix": patch
---

Fixes the `editor` fixture's `open`, `create` and `reload` failing after 5s while the canvas is still loading under `plumix dev` with parallel workers; they now wait as long as the test allows.
