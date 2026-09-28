---
"plumix": minor
---

Fixes the admin showing a failed request's raw English text — oRPC's "Conflict", "Forbidden" or "Internal Server Error", a gateway's body, a parser's complaint — in place of localized copy. Every admin error state now shows a message the admin chose, and the original error goes to the console. Adds `describeRpcError`, `rpcErrorReason` and `rpcErrorCode` to `plumix/admin`, so plugin admin code can map a failure's `data.reason` to its own descriptor with a fallback. An error's `message` is no longer a channel to the screen: send a reason and map it.
