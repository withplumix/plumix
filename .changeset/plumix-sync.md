---
"plumix": minor
---

Adds `plumix sync pull` and `plumix sync push`, which replace the local or the deployed site's data with the other's, one scope at a time (`content`, `media`, `users`, `plugin:<id>`), with a dry run, a confirmation and a snapshot before a push. A runtime moves the data through a new `sync` export from its commands module; until a runtime ships one, `plumix sync` fails with `sync_runtime_unsupported`. Also adds the `sync:after` action, `purgeAll` on the CDN port (the Cloudflare provider purges the whole zone), `settleSync` and the transport types on `plumix/cli`, `memorySync` on `plumix/test`, `describeSyncContract` on `plumix/test/conformance`, and `getActionHandlers` on the hook registry.
