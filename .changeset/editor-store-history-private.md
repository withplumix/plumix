---
"@plumix/admin-editor": minor
---

Removes `history` and `setTree` from the editor store's published state and adds `canUndo` / `canRedo` fields in their place; undo and redo now drop selected ids whose blocks the restored tree no longer contains.
