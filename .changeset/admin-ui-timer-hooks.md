---
"plumix": minor
---

Adds `useTimedFlag` and `useDebouncedValue` to `plumix/admin/ui`. `useTimedFlag(ms)` returns `[on, trigger, reset]` for a notice such as "Copied" that turns itself off after `ms`; each `trigger` restarts the countdown, and unmounting cancels it. `useDebouncedValue(value, ms)` returns `value` once it has held still for `ms`. The admin's "Copied" notices and the editor's "can't place here" notice now stay up for their full time after a repeated click or refused drop instead of vanishing early.
