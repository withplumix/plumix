---
"@plumix/plugin-comments": patch
---

Fixes the thread route, the REST resource and the submit handler accepting a revision or autosave id. They now load the entry through core's `loadAuthoredEntry`, so such an id answers `entry_not_found` even on a site that lists those types in `entryTypes`.
