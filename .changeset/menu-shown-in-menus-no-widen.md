---
"@plumix/plugin-menu": patch
---

Stops the menu item picker from offering entry types and taxonomies registered with `isPublic: false`, even when they set `isShownInMenus: true`. Such types have no public URL, so their items never rendered in a menu. Menu items already saved against such a type now show as broken in the menu editor, so they can be removed or replaced with a custom URL. `isShownInMenus` now only hides a public type.
