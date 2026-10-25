---
"plumix": minor
---

Adds `entry:<type>:edit_layout`, so a site can grant layout editing separately from content editing. Authors, editors and admins hold it by default; contributors and any role without it can change only a block's content inputs, in the editor and on every save, MCP agents included, which refuse a layout change with a `layout_change` issue. Block authors should mark the inputs that hold content (text, links, media) with `content: true`: an input without it counts as layout. A block's `capability` is now enforced on save as well as in the inserter.
