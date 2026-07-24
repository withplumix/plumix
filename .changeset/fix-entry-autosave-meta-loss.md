---
"@plumix/core": patch
"@plumix/admin": patch
---

Entry autosave no longer silently drops meta edits. The editor and plain-form now send only the changed meta keys, so a key the editor doesn't own (e.g. a `featuredImage` written by another plugin) is never re-validated and can't fail the whole write with `meta_not_registered`. The autosave row now accumulates content/excerpt/meta on the existing draft instead of rebasing on the live row on every write, so a partial autosave no longer drops a key an earlier one set — title stays anchored to the live row, which the editor writes it to directly. Both editor debouncers are serialized through one save queue so they can't race the shared optimistic-concurrency token into `409` conflicts, a recovered stale conflict retries once instead of surfacing a failure, and a deletion of an unregistered meta key is now a harmless no-op.
