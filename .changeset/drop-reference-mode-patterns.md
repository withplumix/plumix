---
"plumix": minor
---

Removes reference-mode patterns, which rendered nothing on the published page. Every pattern now inserts a copy of its body. **Breaking:** `BlockPattern.insert`, the manifest pattern entry's `insert` field and the `core/pattern-ref` block are gone, along with `renderBlockTree`'s `patterns` option. A stored `core/pattern-ref` node now fails content validation as an unknown block, so replace it with the pattern's blocks before its entry is next saved.
