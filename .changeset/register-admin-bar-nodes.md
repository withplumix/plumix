---
"plumix": minor
---

Adds `ctx.registerAdminBarNode` for adding a node to the admin bar from `setup`, with per-request `href` and `visible` functions. Removes the `admin_bar:nodes` filter, so a plugin can no longer remove another plugin's nodes. Register each node instead. A duplicate node id now fails boot with `DuplicateRegistrationError` instead of a "last contributor wins" warning. A node whose `parent` isn't registered fails boot too. A node whose `href` or `visible` throws is left out and logged, and the rest of the bar still renders.
