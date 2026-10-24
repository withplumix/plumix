---
"plumix": patch
---

Fixes plugin admin pages registered with `ctx.registerAdminPage` but no `nav` returning 404: every admin page is now served at `/_plumix/admin/pages/<path>`, behind its `capability`, whether or not it has a menu item.
