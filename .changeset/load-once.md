---
"plumix": minor
---

Adds `loadOnce` to `plumix/support`: it wraps an async factory, usually a dynamic `import()`, so every caller in the isolate awaits one promise and a rejected load is retried on the next call. Fixes concurrent first requests under `plumix dev`, such as several magic-link requests at once on a cold server, failing with `Cannot read properties of undefined (reading '~run')`: every lazily loaded module in core now loads once per isolate.
