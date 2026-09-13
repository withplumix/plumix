---
"@plumix/runtime-node": minor
---

Bounds a Node shutdown by one deadline, as it was documented to be, and reports each piece of work that deadline cuts. `SIGTERM` gives the scheduler stop, the in-flight drain and the deferred-work drain a shared ten seconds — but the in-flight drain raced a fresh full ten rather than what was left, so a scheduler stop that took four seconds pushed the process to fourteen, past a grace period sized for ten. Every step now spends from the same clock.

A scheduled run still going when the budget runs out is now reported. It used to be dropped silently, and the process could exit 0 even though the run guard never replays that minute; it now logs the cut run and exits 1, as it already did for cut responses and abandoned deferred work. Breaking for implementers: `Scheduler.stop()` now resolves a boolean — `false` when its budget ran out with a firing in flight, `true` otherwise — so an implementation or stub returning `Promise<void>` no longer type-checks. Each cut line names the budget, `the 10000ms shutdown budget ran out`, rather than implying one step had all of it.
