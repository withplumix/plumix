---
"plumix": patch
---

Fixes rich text gaining a stray empty paragraph when it ends in a heading, list or quote. The editor still lets the caret leave the last block, but the empty paragraph it keeps for that is no longer saved.
