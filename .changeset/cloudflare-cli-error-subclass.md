---
"@plumix/runtime-cloudflare": patch
---

Fixes `plumix dev`'s `--port` and `--inspector-port` errors surfacing as an unexpected crash: a missing or out-of-range value is now reported through the CLI's `code: message` report. `plumix migrate apply`'s D1 errors keep their codes and wording.
