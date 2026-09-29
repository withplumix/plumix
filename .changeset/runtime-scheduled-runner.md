---
"plumix": minor
---

Adds `startScheduledRunner` to `plumix/runtime`, with its `ScheduledRunnerOptions`, `Scheduler`, `SchedulerClock` and `SchedulerLogger` types: the loop a self-hosted runtime fires a site's scheduled tasks with, guarded by the scheduled-run lease in the site's database. The caller names itself in the lease row through the required `holder` option.
