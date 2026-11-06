---
"@plumix/plugin-menu": minor
---

Adds `menu`, exported from `@plumix/plugin-menu/server`, holding the plugin's events `saved` and `deleted` and its async filters `tree` and `item`, so another plugin subscribes with `ctx.filters.add(menu.tree, …)` or `ctx.events.on(menu.saved, …)` with no `declare module`. It is exported from `/server` because the root's `menu()` factory, which still installs the plugin, takes the name. Payloads are unchanged, and saving or deleting a menu still purges the pages that render it. The plugin now needs `plumix` 0.27.0 or later.

Breaking: the `menu:tree`, `menu:item`, `menu:saved` and `menu:deleted` string names are removed from `FilterRegistry` and `ActionRegistry`. Replace `addFilter("menu:item", …)` with `ctx.filters.add(menu.item, …)`, `addFilter("menu:tree", …)` with `ctx.filters.add(menu.tree, …)`, and `addAction("menu:saved", …)` with `ctx.events.on(menu.saved, …)`.
