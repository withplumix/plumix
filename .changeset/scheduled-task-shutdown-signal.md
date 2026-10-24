---
"plumix": patch
---

Aborts a running scheduled task's `ctx.signal` when the Node or Bun scheduler stops, with a `DOMException` named `AbortError` whose `cause` is `"shutdown"`, so a task that checks it can stop between batches instead of being cut off at exit. The task is reported in `timedOut`, and its span and log say it was shut down. The scheduler's `fire` callback receives that signal as an optional third argument, and `Invocation` gains an optional `signal` that `handler.scheduled` hands to each task.
