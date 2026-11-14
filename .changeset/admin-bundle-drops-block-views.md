---
"plumix": patch
---

Fixes `_plumix/admin/plugins/site-bundle.js` growing with every block a theme adds: the admin plugin bundle now keeps only block definitions and leaves each block's view module out.
