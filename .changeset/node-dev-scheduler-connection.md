---
"@plumix/runtime-node": patch
---

`plumix dev` no longer leaks the scheduler's database connection on every reload. The scheduler that `startScheduledRunner` and `startCron` return now closes the connection it opened once `stop()` resolves `true`; a firing that `stop({ timeoutMs })` gave up on keeps it, since that firing may still write through it. `stop()` stays safe to call more than once, and a connection that fails to close is logged rather than failing the stop.
