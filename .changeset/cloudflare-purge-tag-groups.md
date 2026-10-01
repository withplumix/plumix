---
"plumix": patch
---

Fixes Cloudflare cache purges failing when one request changes content carrying more than 100 cache tags, such as bulk-publishing 100 entries. The purge is now sent in groups of at most 100 tags, Cloudflare's per-call limit, so those pages no longer stay stale until their TTL runs out.
