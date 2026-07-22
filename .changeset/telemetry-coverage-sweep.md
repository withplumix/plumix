---
"@plumix/core": minor
"@plumix/runtime-cloudflare": minor
---

Telemetry coverage sweep: every execution path now produces a full span tree through `ctx.telemetry` (#1485).

- Phase spans carry attributes: `dispatch` records the response status; `resolve` records the route intent, resolved entity, and matched template (stamped even when the render throws); `render` records the resolved node.
- New spans at existing choke points: auth/session resolution (`auth` span with outcome + user id at every authenticate site, bearer included), per-handler hook execution (`hook: <name>` with `hook.plugin`, on the async `applyFilter`/`doAction` pipelines), and per-task cron runs (`cron: <id>`).
- Edge-cache decisions are recorded as durationless `cache` facts: `hit`, `miss` (+ whether stored), or `bypass` with the failing gate as `reason`.
- MCP `tools/call`, REST, and admin RPC dispatch each produce a named span per tool/procedure; scheduled runs deliver their own snapshot post-run (the Cloudflare adapter now passes the telemetry config to the scheduled context).
- New `ctx.requestId`, minted at context creation and reused as the snapshot envelope's `requestId`, so mid-request consumers and the finished snapshot correlate on one id.
