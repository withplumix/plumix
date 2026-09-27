---
"@plumix/plugin-audit-log": minor
---

Removes the write pipeline's internals from the published surface: `assertValidRetention` from the package root, and `createAuditService`, `AuditService`, `buildAuditRow`, `extractSubject` and `subjectExtractors` from `@plumix/plugin-audit-log/server`. Nothing outside the plugin used them. Log your own events through `ctx.audit.log()`. `runRetentionPurge` already validates the retention it is given. `sqlite` stays on both entries.
