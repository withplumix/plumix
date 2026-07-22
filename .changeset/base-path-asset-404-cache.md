---
"@plumix/core": patch
---

On subdirectory mounts (`basePath`), asset-shaped requests outside the base — above all the browser's root `/favicon.ico` probe — now get the same cacheable plain 404 (`Cache-Control: public, max-age=300`) as in-base asset misses, instead of an uncacheable worker-invoking 404. Out-of-base paths can never be routed by the app, so the cacheability argument is strictly stronger than for in-base misses; non-asset out-of-base 404s remain uncacheable.
