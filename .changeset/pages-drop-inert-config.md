---
"@plumix/plugin-pages": patch
---

Drops `supports: ["slug"]` and `capabilityType: "page"` from the `page` entry type registration — neither had any effect. `slug` had no reader anywhere in core or the admin, and `capabilityType` already matched the type's own name, which is the default it falls back to when unset.
