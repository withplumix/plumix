---
"@plumix/plugin-media": patch
---

Fixes the media library and media pickers offering an upload button, dropzone and drag-and-drop on a site with no `storage:` slot. They are now hidden there, and an empty library explains that uploads need a `storage:` slot in `plumix.config.ts`.
