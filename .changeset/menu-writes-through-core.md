---
"@plumix/plugin-menu": minor
---

Fixes a cached nav keeping a term's old name: a page that renders a menu item linking a term is now purged when the term is renamed. Publishing a draft that a menu item links now purges the pages that render the menu too. The menu writes its menus, items and their links through `ctx.terms` and `ctx.entries`, so creating a menu announces `term:created`. A page that renders a menu is stored under the menu's term tag and each item's tag: adding an item or deleting the menu purges it, and so does editing, moving or removing an item. A save that changes nothing purges nothing. Menus are no longer stored under a `menu:<id>` tag.
