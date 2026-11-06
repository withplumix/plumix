---
"plumix": minor
---

Moves settings to the event and filter API. `settings` is exported from `plumix/plugin`. It holds `settings.groupChanged`, emitted with `{ group, set, removed }` when a write changes a public group, and the settings procedures' filters under `settings.rpc` (`settings.rpc.get.input`, `settings.rpc.get.output`, `settings.rpc.upsert.input`, `settings.rpc.upsert.output`). An output filter receives `{ group }` as its input. `settings.for(group)` scopes the event and the `rpc` filters to one group, so a handler no longer checks the group by hand. At the same `order`, scoped handlers run before unscoped ones. A scope naming no registered settings group fails boot and lists the registered groups.

Breaking: the `settings:group_changed` and `rpc:settings.*` string names are removed. Replace `addAction("settings:group_changed", (changes, ctx) => …)` with `ctx.events.on(settings.groupChanged, (changes, ctx) => …)`, or with `ctx.events.on(settings.for("<group>").groupChanged, …)` for one group. Replace `addFilter("rpc:settings.get:output", (copy, { group }, ctx) => …)` with `ctx.filters.add(settings.rpc.get.output, (copy, { group }, ctx) => …)`, or with `settings.for("<group>").rpc.get.output` and no group check.
