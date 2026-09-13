---
"plumix": minor
---

Adds `createPluginRpcClient` to `plumix/admin` — a single client for plugin admin code to call its own server-registered RPC procedures, so a plugin no longer hand-rolls the `{ json, meta: [] }` wire envelope, the `x-plumix-request` header, or error-envelope unwrapping. A failed call now throws the real `ORPCError` the server raised, with `.data` carrying whatever the procedure attached. Adds `plumix/admin/test`'s `stubPluginRpc` and `PluginRpcError` for testing admin code built on the new client.
