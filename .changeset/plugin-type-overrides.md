---
"plumix": minor
---

Adds `applyOverride` and the `Overridable` type to `plumix/plugin`, so a content-type plugin can let a site reshape the types it registers: object options merge key by key, arrays and scalars replace, and an array can compose with `(prev) => next`.
