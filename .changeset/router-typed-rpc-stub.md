---
"plumix": minor
---

Adds router-typed route maps to `stubPluginRpc`: pass the router type your plugin already gives `createPluginRpcClient` — `stubPluginRpc<MenuRouter>("menu", { … })` — and an unknown procedure path, a responder reading the wrong input or returning the wrong output becomes a type error, while `calls` and `lastCallTo(path)` carry each procedure's input type. Untyped calls behave as before. The stub is now served by `@plumix/core/test`'s shared RPC endpoint, so `@plumix/core` gains `@orpc/client` and `@orpc/standard-server-fetch` as dependencies and `plumix` no longer depends on `@orpc/server` or `@orpc/standard-server-fetch` directly.
