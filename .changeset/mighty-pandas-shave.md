---
"@plumix/core": minor
"@plumix/runtime-node": minor
"@plumix/plugin-audit-log": patch
"plumix": minor
---

Fire scheduled tasks on a Node deploy, and settle on one cron dialect

A Node deploy now runs its own scheduled tasks. The schedules come from
`app.scheduledTasks`, so they follow the plugins a site installs rather than a
list kept in the runtime, and the process wakes on each UTC minute to fire the
ones due. It is on by default; `node({ cron: false })` hands the schedules to an
external scheduler instead, and `plumix cron list` / `plumix cron run "<expr>"`
are there to drive them.

Two runs of a task never overlap. Firings are serialised inside the process, and
across processes a claim row and a lease row in the site's own database mean
replicas sharing one database contend there — so exactly one of them runs each
firing.

**Breaking:** a cron expression must now be one every runtime reads the same
way, and `buildApp` rejects one that is not, naming the task. `buildApp` runs at
boot on every runtime, so an expression that comes from an environment variable
passes the build and fails when the site starts — on Cloudflare that is a throw
on every request, not just a dead task. Check your schedules before upgrading.

What is now rejected:

- **A numeric day-of-week.** Cloudflare reads that field as `1-7` with `1` =
  Sunday, Unix cron as `0-6` with `0` = Sunday, so `0 0 * * 1` meant Sunday on
  one and Monday on the other. Write the day by name — `SUN`, `MON`, … — and
  the error names both readings rather than guessing which you meant.
- **The Quartz extensions `L`, `W` and `#`**, which Cloudflare accepted and no
  other runtime does.
- **The `@daily` / `@hourly` / `@weekly` / `@midnight` shorthands**, and
  six-field expressions carrying a seconds column. Write the five-field form.
- **A range that wraps the week**, such as `SAT-SUN`. Write it as a list:
  `SAT,SUN`.

Everything else is unchanged: `*`, lists, ranges and steps in every field, and
numeric months. A site using only those needs no edit.
