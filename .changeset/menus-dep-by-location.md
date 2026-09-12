---
"@plumix/plugin-menu": minor
---

Fixes menu locations never reaching the rendered site. The `menus` template dep is now keyed by location id: `defineTemplate({ menus: ["primary"] })` renders the menu assigned to the `primary` location in the admin, or `null` when nothing is assigned. Before, the dep looked the key up as a menu slug and ignored the assignment. A theme that declared menu slugs should declare the locations those menus are assigned to instead. `menu:tree` subscribers now see the `location` on renders that go through the dep.
