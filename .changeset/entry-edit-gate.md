---
"@plumix/core": minor
---

Adds `canEditEntry` and `assertCanEditEntry` to `plumix` and `plumix/plugin`, so a plugin can ask whether a caller may edit an entry row instead of assembling an `entry:<type>:edit_any` string by hand. A hand-written string misses the namespace a pooled entry type gates under, which would deny every caller once a type pools its permissions onto another. `requireCapability` remains the gate for a capability that doesn't depend on which row is in hand.

Also folds `entry.get`'s preview denial onto `edit_any`. It reported `edit_own` where every other edit-gated procedure reports `edit_any`; a client matching on the reported capability sees the consistent value now.
