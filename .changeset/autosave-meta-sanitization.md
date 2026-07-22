---
"@plumix/core": patch
---

The `entry.update` autosave route now runs the same meta gate as a live write — field sanitizers, field-level capability checks, and reference validation — before persisting the autosave bag. Previously raw client meta was stored on the autosave row and `entry.publish` promoted it verbatim onto the live entry, so declared sanitizers (e.g. `color()`'s hex lowercasing) never ran, capability-gated fields could be written by autosaving then publishing, and dangling reference ids reached the published row. A `null` meta value on autosave now deletes the key on promotion (matching live-write delete semantics) instead of persisting a literal `null`.
