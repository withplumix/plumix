---
"@plumix/core": minor
---

Make the `range()` field's bounds compile-required. `range(key)` now returns a
seed exposing only `.bounds(min, max)`, which returns the field builder — so
forgetting the slider's `[min, max]` track is a type error rather than a runtime
throw at registration. This mirrors the `select(key).options(...)` and
`repeater(key).fields(...)` seed pattern.

Breaking: `range("x").min(0).max(100)` becomes `range("x").bounds(0, 100)`
(other chain methods are unchanged, and `min <= max` is still validated at
registration).
