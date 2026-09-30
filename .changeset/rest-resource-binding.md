---
"plumix": minor
---

Adds binding for a plugin REST resource's `{collection}` and `{entry}` path segments. A resource registered with `registerRestResource` at a path such as `/{collection}/{entry}/likes` now receives the public entry type and the entry those segments name, as `entryType` and `entry`, typed from the path. An unknown collection, or an entry the requester can't read or that is of another type, answers core's 404 before the handler runs. Handlers also receive `errors`, core's REST error set, and the bound segments no longer appear on `input`.
