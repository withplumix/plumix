---
"@plumix/plugin-audit-log": patch
---

Fixes the `auditLog.list` procedure returning `occurredAt` as a `Date` while the admin read it as an ISO string; the procedure now serializes it to an ISO string, the way the comments plugin's queue rows already do.
