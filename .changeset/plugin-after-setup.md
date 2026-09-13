---
"plumix": minor
---

Adds an `afterSetup` phase to plugin descriptors. It runs once every plugin's `setup` has, and its context carries `ctx.plugins` holding everything they registered. Removes `plugins` from the setup context, where it held only what earlier plugins had registered: a plugin that read the registry from `setup`, or subscribed to `theme:ready` to see it complete, registers from `afterSetup` instead, and a request handler reads `appCtx.plugins`.
