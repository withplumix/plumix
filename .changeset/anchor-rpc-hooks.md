---
"@plumix/core": patch
---

Fixes the RPC lifecycle actions (`entry:*`, `term:*`, `user:*`, `settings:*`) sometimes disappearing from `ActionName` for a plugin's build. The module that declares them wasn't anchored into the published declaration graph, so a plugin whose bundler didn't otherwise pull it in saw `ctx.addAction` reject every real action name and had to write `as never` to work around it.
