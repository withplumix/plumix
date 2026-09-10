---
"plumix": patch
---

Cache tags contributed by read-time reference resolution are now lower-cased on
the way in, as tags from every other entry point already were. A page stored
under `t:Post` was not reached by a purge enqueuing `t:post`, so it stayed in
the CDN until its freshness ran out.
