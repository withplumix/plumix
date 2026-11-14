---
"plumix": patch
---

Adds a migration that stops the scheduled-publish task scanning every entry: a new `entries_status_published_idx` index on `(status, published_at)` lets each five-minute run find due scheduled entries directly. Run `plumix migrate` to apply it.
