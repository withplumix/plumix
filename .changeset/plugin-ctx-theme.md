---
"plumix": minor
---

Adds `ctx.theme`: a plugin's `setup` and `afterSetup` read the site's theme from it, in the running app and in the admin's manifest pass alike. Removes the `theme:ready` action; move a `ctx.addAction("theme:ready", (theme) => …)` handler's body into `setup` and read `ctx.theme` instead. `installPlugins` takes the theme as `theme`.
