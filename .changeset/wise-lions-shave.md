---
"@plumix/core": minor
---

Retypes `PluginRpcRouter`, the shape `registerRpcRouter` accepts, from `Record<string, any>` to
oRPC's own router type, so a plugin can name what its router-building function returns. Handing
`registerRpcRouter` a plain callable, or anything else that is not a procedure, is now reported
where the router is written instead of as a 404 at request time. Sub-routers still nest to any
depth, and lazy ones are accepted, as oRPC allows.

It was already reachable through `plumix/plugin` — it just published a dictionary of `any`, so
naming it bought nothing over the loose annotation both first-party routers were using instead.

Source-breaking for plugin authors on the type level only; the emitted JS is unchanged. Migration:
a router-building function annotated `Record<string, unknown>` (or `Record<string, any>`) should now
return `PluginRpcRouter`. If you name the router's shape separately, declare it with `type` and not
`interface` — TypeScript withholds the implicit index signature from interface declarations, so an
interface never assigns.
