---
"plumix": patch
---

Fixes a new entry opening with a dead editor canvas, where inserted blocks never rendered. `BlockRenderer` now accepts the `null` that `entry.contentBlocks` holds for an entry with no content: it renders nothing on the page and still gives the editor canvas its root, so a template can pass `contentBlocks` straight through instead of skipping `BlockRenderer` for empty entries.
