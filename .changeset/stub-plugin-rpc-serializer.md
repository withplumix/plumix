---
"plumix": minor
---

Fixes `stubPluginRpc` (`plumix/admin/test`) dropping the type hints the real RPC wire carries, so a responder can now return a `Date`, `bigint`, `Set`, `Map`, `RegExp` or `URL` and the client revives it — in both directions, and on a thrown `PluginRpcError`'s `data`. A test whose responder read the old JSON projection of a non-JSON input now sees the revived value.
