---
"@plumix/plugin-menu": minor
---

Changes `menu.get` to send each item's `meta` already parsed — the declared `MenuItemMeta`, or `null`
when the stored JSON matches no known kind — instead of the raw column. `MenuItemMeta` and its arms
are now type aliases rather than interfaces, so the shape assigns to the `entries.meta` column
directly. A menu item whose stored meta doesn't parse now loads in the editor as an empty custom-URL
item, so it stays visible, stays fixable, and no longer rejects the whole save.
