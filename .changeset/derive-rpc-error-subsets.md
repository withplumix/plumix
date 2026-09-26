---
"plumix": minor
---

Derives `EntryEditErrors` and the `errors` parameter of `previewableEntry` from core's typed RPC errors instead of hand-written shapes. A procedure's own `errors` still passes unchanged; a hand-built stub must now return an `ORPCError` (build one with `createORPCErrorConstructorMap`). `previewableEntry` now accepts a `NOT_FOUND` whose `id` is `string | number`.
