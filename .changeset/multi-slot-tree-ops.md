---
"@plumix/admin-editor": patch
---

Fixes editing a block with more than one slot. Duplicate, paste, move up/down, group and ungroup on a block in any slot after the first now stay in that slot, and the Layers panel lists every slot's children. Previously they landed in the first slot or did nothing, and the Layers panel hid every slot after the first.
