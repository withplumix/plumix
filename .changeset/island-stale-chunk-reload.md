---
"plumix": patch
---

Fixes islands that never hydrate in a tab opened before a deploy: when an island's chunk still fails to import after its retry, the page reloads once to load the current build. Call `preventDefault()` on the `plumix:hydration-error` event to keep the server HTML instead.
