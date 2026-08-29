---
"@plumix/plugin-og": patch
---

Pins the card renderer to an exact `@takumi-rs/wasm` version instead of a caret range. A range let a
site install a release this package's raster tests had never rendered with — a break that surfaces
as a wrong unfurl weeks later rather than as an error. Nobody moves version: the pin names what the
caret already resolved to, so an existing install is byte-identical.
