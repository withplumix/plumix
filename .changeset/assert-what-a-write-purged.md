---
"plumix": minor
---

Adds `site.cdn` to the test site from `plumix/test`, and purge assertions to `fakeCdn()`. Beside `assertStored(path)` and `assertNotStored(path)`, the fake now records every purge, so a test checks what a write invalidated with `assertPurged(tag)`, `assertNotPurged(tag)` and `assertNothingPurged()`. A failed assertion lists the tags that were purged.
