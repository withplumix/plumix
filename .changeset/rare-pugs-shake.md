---
"@plumix/core": patch
---

Hydrates each meta reference at most once per request: resolve batches now share a request-scoped memo keyed by the viewer plus the reference's kind, scope and id, so a page that resolves the same entry, term or media in several batches queries it once. `memoBatch` hands its loader only the ids that missed the memo.
