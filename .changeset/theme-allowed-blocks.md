---
"plumix": minor
---

Adds `allowedBlocks` to `defineTheme`, so a theme can list the blocks the editor allows. The inserter offers only those blocks and hides patterns and variations holding any other, and a save from the editor or an agent can't add a new block outside the list. An entry that already holds one keeps it, and the editor shows it with a notice and no duplicate, copy or paste.
