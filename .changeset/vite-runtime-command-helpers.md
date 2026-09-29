---
"plumix": minor
---

Adds the shared halves of a self-hosted runtime's `plumix build` and `plumix dev` to `plumix/vite`: `serverEnvironment` (the bundled server environment, parameterised by entry, output directory, externals and resolve conditions), `runBuildCommand` (emit the plumix sources, then build client-first) and `runDevCommand` (one Vite server with a runnable server environment, the loopback gate, runner invalidation on edit, the project's `.env` loaded with the shell winning and reloaded on each restart, and a last middleware into the entry's `fetch`, with `--port` and `--host`). A runtime supplies only its configuration.
