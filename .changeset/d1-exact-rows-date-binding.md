---
"@plumix/runtime-cloudflare": patch
---

Fixes two D1 differences from the other database adapters. `rowsAffected` on an update or delete now counts only the statement's own rows, so a one-row `UPDATE` of an entry reports 1 rather than 2 once its change-feed trigger fires. A Date passed into a raw `sql` template now binds as epoch milliseconds instead of being refused.
