---
"@plumix/core": patch
---

Fixes the `mockManifest` Playwright helper throwing "Response has been disposed" and failing an unrelated test. Document responses disposed mid-rewrite are now served unmodified instead of erroring.
