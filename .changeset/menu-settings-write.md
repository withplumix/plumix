---
"@plumix/plugin-menu": patch
---

Writes menu locations through `ctx.settings`, so assigning or clearing a location moves the `menu_locations` group's `etag` and an older copy of the group is refused as a conflict. Deleting a menu bound to a location now fires `settings:group_changed` before `menu:deleted`, not after.
