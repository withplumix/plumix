---
"plumix": minor
---

Adds `ctx.settings.write(group, values)`, which `settings.upsert` writes through too: a plugin writes a settings group and the pages that printed it are purged and `settings:group_changed` fires, with no hook fired by hand. Adds `ctx.settings.writeIfAbsent(group, values)`, which stores only the keys a group lacks, so racing first writers keep the first value. A write to a private (`_internal`) group purges the same way but fires no `settings:group_changed`, so its secret values reach no subscriber. A write without a guard moves the `etag` of a group that has been saved, so an editor's save from a copy read before it is refused as a conflict.
