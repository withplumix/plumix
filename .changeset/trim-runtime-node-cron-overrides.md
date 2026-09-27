---
"@plumix/runtime-node": minor
---

Removes `db` from `CronOverrides`, so `site.startCron()` no longer accepts a database. It was a test seam: the scheduler's run guard always writes to the site's own database. Drop the option from your call.
