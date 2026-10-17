---
"@plumix/runtime-cloudflare": patch
---

Fixes a demo session database leaving foreign keys unenforced after its tables are dropped and rebuilt, so `ON DELETE` cascades, `set null` and `restrict` keep firing for the rest of the session.
