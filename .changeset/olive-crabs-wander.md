---
"@plumix/core": patch
---

`openPlaygroundDb` now sets `busy_timeout = 5000` on the connection it
returns. libsql opens with no busy handler, so a test-side write that
overlapped one from the running worker — or from a sibling Playwright
worker on the same file — failed on the first attempt instead of waiting.
