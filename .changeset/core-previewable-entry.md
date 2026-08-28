---
"@plumix/core": minor
"plumix": minor
"@plumix/plugin-og": patch
"@plumix/plugin-seo": patch
---

Adds `previewableEntry`, so a plugin building an editor-side preview does not hand-roll its own
authorization gate. It loads an entry by id, rejects a type outside the calling procedure's
allowlist as `NOT_FOUND`, gates on `edit_any` or author-plus-`edit_own`, and overlays the caller's
pending autosave onto the row's content, excerpt and meta.

The gate is the editor's own rather than the read gate a published entry would pass for anyone,
because a preview carries the entry's title and excerpt and a draft's are not public yet. The
allowlist is load-bearing: unlike `entry.get`, the gate does not re-check `read` or reject reserved
types, so a caller must pass its own registered types rather than a wide or user-supplied list.

`@plumix/plugin-og` and `@plumix/plugin-seo` now share this one implementation instead of carrying
a copy each. Neither plugin's behaviour changes.
