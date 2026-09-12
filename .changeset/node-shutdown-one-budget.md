---
"@plumix/runtime-node": patch
---

Bounds a Node shutdown by one deadline, as it was documented to be. `SIGTERM` gives the scheduler stop, the in-flight drain and the deferred-work drain a shared ten seconds — but the in-flight drain raced a fresh full ten rather than what was left, so a scheduler stop that took four seconds pushed the process to fourteen, past a grace period sized for ten. Every step now spends from the same clock. The consequence runs the other way too: a scheduler stop that uses the whole budget now leaves the in-flight and deferred drains nothing, so a shutdown that used to exit 0 at fourteen seconds exits 1 at ten. The cut line now names the budget — `the 10000ms shutdown budget ran out` — rather than implying in-flight responses had all of it.
