---
"plumix": patch
---

Fixes selecting a rich-text block in the editor leaving an undo step that changes nothing, so the first Undo after a selection did nothing.
