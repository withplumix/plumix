---
"@plumix/core": minor
"@plumix/runtime-node": patch
"plumix": patch
---

Report scheduled-task failures instead of swallowing them

A scheduled task that throws is caught so its siblings still run, which left
every caller unable to tell a healthy run from one where everything failed.
`plumix cron run` exited zero either way, so a Kubernetes CronJob's alerting
never fired, and the in-process scheduler logged each task's error without ever
saying the firing as a whole had not done its job.

A firing now answers with a `ScheduledRunReport` — `{ ran, failed, aborted? }`.
`runScheduledTasks` returns one and `PlumixHandler.scheduled` may resolve to
one; an adapter that answers nothing still conforms, and its caller then knows
only that the run was attempted. `plumix cron run` exits non-zero naming the
tasks that failed, and the Node scheduler logs the same summary.

`aborted` is separate from `failed` on purpose: a run that never reached its
tasks — a missing binding, a database that will not connect — reports why,
rather than naming a task that never started.
