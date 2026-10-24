---
"plumix": minor
---

Adds `ctx.settings.write(group, values)`, which `settings.upsert` writes through too: a plugin writes a settings group and the pages that printed it are purged and `settings:group_changed` fires, with no hook fired by hand. A write without a guard moves the group's `etag`, so an editor's save from a copy read before it is refused as a conflict.
