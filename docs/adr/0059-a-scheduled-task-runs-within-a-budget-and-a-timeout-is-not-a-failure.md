# A scheduled task runs within a budget, and a timeout is not a failure

Core runs a firing's tasks one after another, and a task had no time limit, so
one that hung delayed every task after it. On Node and Bun the in-process
scheduler serialises firings, so while that firing ran every later one was
reported skipped: one hung task silently stopped all scheduled work on the
server (scheduled publishing, retention purges, the search drain) until the
process restarted. The run report knew only `ran` and `failed`, so an
overrunning task could not be told apart from a broken one (#3266).

> **Every scheduled task runs within a budget: its registration's `timeoutMs`,
> or 5 minutes on every runtime. When the budget runs out, core aborts the
> task's `ctx.signal`, stops waiting, and runs the next task. The report names
> the task in `timedOut`, apart from `failed`, and the timeout is logged as a
> warning, not reported as an error.**

## What this means

- **`ctx.signal` is on every `AppContext`.** Each task gets its own, and
  `ctx.fetch` follows it, so an in-flight call aborts with the task. On a
  request or `handler.run` context it never fires.
- **The reason is a standard `DOMException`.** It is named `TimeoutError`, its
  `cause` is `"timeout"`, and its message names
  the budget, such as `timed out after 5m`. There is no Plumix error class, as
  for `ctx.fetch` (ADR 0056).
- **Core stops waiting; it does not kill.** A task that ignores its signal
  keeps running in the background. Only its own work leaks, and the report
  names it.
- **Only core's budget is a timeout.** A task counts as timed out when its
  budget ran out, whether or not it then rejected with the signal's reason. A
  task that throws anything else, an `AbortError` of its own included, failed.
- **A timeout is not an error.** It is a warn log with the task, plugin, cron
  and budget, and the task's span ends with status `cancelled` and a message
  that begins `timed out after`, so error tools and alerting on error logs do
  not page on a known-slow task.
- **`ran` counts only tasks that completed.** `plumix cron run` names each
  timed-out task with its budget, prints `N ran · N failed · N timed out`, and
  exits non-zero, as it does on a failure: the run did not do its job.
- **On Workers a timeout alone does not fail the invocation.**
  `surfaceScheduledFailure` still throws only for a failed or aborted run, so
  a timeout there is the warn log and the `timedOut` entry. Whether it should
  fail the invocation is left open.

## Considered options

- **No budget** (the state before). Rejected: one hang stops every later
  firing on a server runtime, and the only trace is a "skipped" line a minute.
- **A timeout counted as a failure.** Rejected: "too slow" and "broken" need
  different fixes, and an error report for a task that only needs a larger
  budget floods the error tools like a crash would.
- **A per-runtime default**, such as the platform's limit on Workers.
  Rejected: a Node or Bun server has none, and one number on every runtime is
  what an author can reason about. On Workers it simply fires first.
