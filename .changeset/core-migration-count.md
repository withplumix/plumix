---
"plumix": minor
---

Adds `coreMigrationCount()` to `plumix/test`. It returns how many migrations core ships, read from core's migration journal, so a test that counts applied core migrations doesn't break when core adds one.
