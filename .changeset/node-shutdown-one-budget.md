---
"@plumix/runtime-node": patch
---

Bounds a Node shutdown by one deadline, as it always claimed to be. `SIGTERM` gives the scheduler stop, the in-flight drain and the deferred-work drain a shared ten seconds — but the in-flight drain raced a fresh full ten rather than what was left, so a scheduler stop that took four seconds pushed the process to fourteen, past a grace period sized for ten. Every step now spends from the same clock, which also makes the "in-flight responses cut after 10000ms" line true rather than approximate.
