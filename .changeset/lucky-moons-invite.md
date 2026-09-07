---
"@plumix/core": minor
"plumix": patch
---

Guard `plumix cron run` against overlapping runs

`plumix cron run` fired unconditionally, so the deploys most likely to overlap —
the ones on `cron: false`, driven by a system cron or a Kubernetes CronJob whose
invocation overran its own schedule — were the ones with no protection. It now
takes the same claim and lease the in-process scheduler does, with the same
per-schedule lease policy, and reports which it did rather than exiting green
having run nothing.

It also honours `--cwd` when opening the database, and turns an unmigrated or
unreachable one into an error naming the fix instead of a raw driver message.

Core exports `connectScheduledDb`, the one place that opens the database a
scheduled run writes through, so the runtime adapter and the CLI cannot drift on
how they connect it.
