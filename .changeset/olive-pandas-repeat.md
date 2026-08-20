---
"@plumix/core": patch
---

Stops `mockManifest` forwarding stale response headers onto the document it rewrites. `content-encoding`, `content-length`, `transfer-encoding`, `etag`, and `last-modified` all described the original bytes, not the decoded and resized body being served, so they are now dropped and Playwright reframes the response itself.
