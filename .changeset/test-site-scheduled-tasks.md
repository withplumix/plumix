---
"plumix": minor
---

Adds scheduled tasks to `testSite()`. `site.runSchedule("0 3 * * *")` fires a schedule through core's own scheduled run: only the tasks on that cron (and those that declare none) run, each within its budget, and the CDN purge and deferred work settle before it resolves. `site.runTask("forms:retention-purge")` runs one task by its `plugin:task` id. Both return a run report with `assertRan(id)`, `assertFailed(id)` and `assertTimedOut(id)`. `site.schedule.assertScheduled(id, cron)` checks a task's registration without reading the registry.
