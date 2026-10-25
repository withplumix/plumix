---
"plumix": patch
---

Adds CDN purges to traces. A purge now appears as a `cdn: purge` span under the `defer` span of the request that wrote, carrying the purged tags as `cdn.tags`, with its error when the purge fails and `unfinished` when it is still running at the 10s delivery deadline. A whole-cache purge appears as a `cdn: purge all` span.
