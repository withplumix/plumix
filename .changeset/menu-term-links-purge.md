---
"@plumix/plugin-menu": patch
---

Fixes a cached page keeping a menu item's old label and link after the term it links to is renamed: a page that renders a menu is now purged by a change to any term the menu links, as it already was by a change to a linked entry. Requires plumix 0.25.0.
