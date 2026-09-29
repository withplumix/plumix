---
"@plumix/runtime-bun": minor
---

Fires the site's scheduled tasks in-process, in UTC, at the same minutes as on Node and Cloudflare. Several instances sharing one database fire a minute once, through the scheduled-run lease. On `SIGTERM`/`SIGINT` the scheduler stops before deferred work drains, and its timer never keeps the process alive. `createBunSite` returns `startCron(overrides)` for a host running its own `Bun.serve`.
