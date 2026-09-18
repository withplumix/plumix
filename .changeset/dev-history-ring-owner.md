---
"@plumix/core": minor
---

Adds `dev.history` to bound the dev request-history ring — `maxEntries`, `maxTotalBytes` and `maxStringLength` — that the debug bar's switcher, the request-history viewer and the dev MCP tools all read. The ring is now built by the app from this config and handed to each reader, rather than being a module singleton no setting could reach.

Breaking: the request-history module no longer exports a `debugHistory` singleton; read the ring from `ctx.debugHistory` (or `app.debugHistory`). `DebugHistoryStore` and `DebugHistoryStoreOptions` are now exported.
