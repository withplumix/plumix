---
"plumix": minor
---

Bounds every `ctx.fetch` call with a 10s default timeout, so an upstream that never answers can no longer hang a request or task. A call that runs out rejects with the standard `TimeoutError`, and its span in the debug bar says it timed out and after how long. Pass `{ timeout: ms }` to change the bound for one call, or `{ timeout: false }` to lift it for a long download; your own `signal` still aborts the call.
