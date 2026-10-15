---
"plumix": minor
---

Adds an `editor` fixture to `plumix/test/playwright` that drives the real block editor: open or create an entry, insert, select and move blocks, fill the inspector by input name, edit rich text, save and publish, and read back the stored block tree. A site can now test its own blocks in the editor without hand-rolled selectors or waits.
