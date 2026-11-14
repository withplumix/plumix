---
"plumix": minor
---

Removes `settleMeta` from `plumix/db`. Write entry, term and settings meta through `ctx.entries`, `ctx.terms` or `ctx.settings.write`, which settle it. User meta has no plugin-side writer yet: core writes it only through the `user.update` RPC procedure the admin calls, so a plugin that writes user meta directly stores it unsettled. Run `plumix meta settle` to convert those values.
