---
"@plumix/runtime-bun": patch
---

Aborts a running scheduled task's `ctx.signal` when the site shuts down, so a task that checks it stops between batches instead of being cut off at exit.
