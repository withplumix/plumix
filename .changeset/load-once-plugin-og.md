---
"@plumix/plugin-og": patch
---

Loads the card engine and its dev surfaces through `loadOnce` from `plumix/support`, so a failed engine load is retried on the next card request. Requires `plumix` 0.26.0 or later.
