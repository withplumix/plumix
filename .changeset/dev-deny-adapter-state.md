---
"plumix": patch
"@plumix/runtime-node": patch
"@plumix/runtime-bun": patch
---

Fixes `plumix dev` on Node and Bun serving the site's SQLite database, its `-wal`, `-shm` and `-journal` files and the `diskStorage` directory as static files. A request for any of them now gets a 403, and a runtime's `runDevCommand` options can name the paths its slots keep on disk with `privatePaths`.
