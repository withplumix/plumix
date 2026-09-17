---
"plumix": minor
---

Fixes capability checks for an entry type registered with a `capabilityType` different from its name: every server check (list, get, search, route resolve, preview, the dashboard, and the create, update, publish, duplicate, discard, trash, restore, delete, revision, activity and lookup procedures) now gates it by the pooled `entry:<capabilityType>:*` capabilities, as the docs promise, while rows are still matched by the registered type name.

The namespace is resolved once, at registration. `RegisteredEntryType.capabilityType` is now a required `string` (the type's own name unless it pools), and the admin manifest's entry type `capabilityType` is a required `string` too, so a hand-built manifest fixture must carry it. Code that reads `capabilityType ?? name` can drop the fallback; code that builds a registered type by hand should go through `toRegisteredEntryType` from `plumix/test`, or set `capabilityType` itself.
