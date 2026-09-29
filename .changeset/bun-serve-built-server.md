---
"@plumix/runtime-bun": minor
---

Adds the `bun()` runtime adapter and `bun --bun plumix build`: the built `dist/server/worker.js` runs with `bun` on `Bun.serve`, one listener on `PORT`/`HOST`, serving `dist/client` through `Bun.file` with hashed assets immutable. `bun({ trustProxy, bodySizeLimit, idleTimeout })` opts in to forwarded headers, caps request bodies (1 GiB, answered 413 by Bun) and sets the idle timeout (30 s, `0` disables it, above 255 throws); event streams are never cut by it. `SIGTERM`/`SIGINT` finish in-flight responses and drain deferred work within 10 s.
