---
"plumix": minor
---

Adds the `SharedAdminRuntimeKey` type to `plumix/admin`: the keys of `window.plumix.runtime` that the admin shims read. `PlumixAdminRuntime` is now keyed by it, so the admin's runtime object and the shims plugin chunks import can no longer drift apart. `PlumixAdminRuntime` is now a type alias rather than an interface, with the same keys and value types.
