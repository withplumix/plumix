---
"plumix": minor
---

Adds `ctx.entries.create`, `ctx.entries.update` and `ctx.entries.delete`, the write path core's own entry procedures take: a plugin's entry write runs the meta pipeline, fires the lifecycle actions, enforces `ifMatch` and the edit lease as `entry.update` does, and purges the CDN. Adds `kind` (`"entry"`, `"term"` or `"user"`) to `LookupAdapter`, so a page that hydrates an adapter's ids is stored under each entity's tag.
