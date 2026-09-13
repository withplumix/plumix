---
"@plumix/core": patch
---

Fixes `createDispatcherHarness` wiring request contexts differently from the runtime handler: it now connects an `imageDelivery` slot that declares `connect` instead of handing requests the unconnected slot, and takes a `kv` option so a test can put a store on `ctx.kv`. Both build their contexts from one argument list, so a new context slot has to be wired into both. Several helpers that take a request context (`canonicalUrl`, `tagCdnEntry` and others) now accept just the fields they read, so a test can call them with a small object instead of a full `AppContext`.
