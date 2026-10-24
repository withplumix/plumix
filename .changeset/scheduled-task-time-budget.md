---
"plumix": minor
---

Runs each scheduled task within a time budget, so one hung task can no longer stall the tasks after it or stop every later firing on a Node or Bun server. A task gets 5 minutes unless its registration sets `timeoutMs`. When the budget runs out, the new `ctx.signal` aborts with a `TimeoutError`, any `ctx.fetch` in flight aborts with it, and the run moves on to the next task. `ScheduledRunReport` gains `timedOut`, listing those tasks apart from `failed`. A timeout is logged as a warning, not an error. `plumix cron run` names each timed-out task with its budget, prints `N ran · N failed · N timed out`, and exits non-zero. `ctx.signal` exists on every `AppContext` and never fires on a request.
