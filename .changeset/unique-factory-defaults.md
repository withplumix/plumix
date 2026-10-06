---
"plumix": patch
---

Fixes `actingAs(db, role)` from `plumix/test/playwright` failing with `UNIQUE constraint failed: users.slug` when parallel Playwright workers seed one database. The test factories' defaults on unique columns (user email and slug, entry and term slugs, session and credential ids, setting group and key, allowed-domain domain, OAuth account id, device-code user code) now carry a per-process token, so two processes never mint the same value. Values you pass explicitly are used as before.
