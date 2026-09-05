---
"plumix": patch
---

`emitPlumixSources` now also returns the config's `runtime` adapter, so a runtime's `dev` command that defers building the app can still read its own options.
