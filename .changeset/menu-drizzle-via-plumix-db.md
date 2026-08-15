---
"@plumix/plugin-menu": patch
---

Route the menu plugin's remaining drizzle query operators through the
`plumix/db` seam and drop its direct `drizzle-orm` dependency.

The core root-barrel cleanup (#1774) moved the RPC router's operators onto
`plumix/db` and its tables onto `plumix/schema`, but the server resolvers
(`getMenuByName`, `getMenuForLocation`) and their tests still imported
`and`/`eq`/`inArray` straight from `drizzle-orm`. Menu defines no tables of its
own, so those operators now come from `plumix/db` too and the package no longer
declares `drizzle-orm` — the direct-write follow-up deliberately left out of
#1774 (#1700/#1766). No behavior or public-surface change.
