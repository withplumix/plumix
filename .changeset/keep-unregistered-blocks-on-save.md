---
"plumix": patch
---

Fixes saving an entry that holds a block whose plugin was removed: the save keeps the block as stored instead of failing with `unknown_block_type`, while adding a new instance of it is still refused. Restoring a revision and duplicating such an entry work too, and the visual editor shows the block as a placeholder that can be moved or deleted.
