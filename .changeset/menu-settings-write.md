---
"@plumix/plugin-menu": patch
---

Writes menu locations through `ctx.settings.write`. Deleting a menu bound to a location now fires `settings:group_changed` before `menu:deleted`, not after.
