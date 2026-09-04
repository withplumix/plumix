---
"plumix": minor
---

Breaking (pre-1.0): `PlumixHandler.dispose()` resolves `{ abandoned }`, the number of deferred tasks still running when its deadline passed, and takes an optional `{ timeoutMs }` for the time a shutdown has left. An adapter implementing its own `dispose` must resolve that shape; callers that awaited `void` are unaffected. A process runtime uses it to exit non-zero over abandoned work instead of only logging.
