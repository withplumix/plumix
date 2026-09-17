---
"@plumix/core": minor
---

Fixes a scheduled run reporting that nothing ran when something after its tasks failed. A `database` slot whose `commit` threw, or a logger that threw recording a failed task, discarded the report the run had produced and replaced it with `{ ran: 0, failed: [], aborted }` — telling `plumix cron run` the run never started, hiding the task failures behind that claim, and costing a Cloudflare firing the `noRetry` that stops Workers replaying tasks which already did their work. `ScheduledRunReport` is now a union rather than a shape with an optional `aborted`, so "aborted means nothing ran" is checked by the compiler for every adapter that builds one.
