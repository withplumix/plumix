---
"plumix": patch
---

Fixes e2e specs that pass on CI and fail on a machine set to another timezone: `definePlumixE2EConfig` from `plumix/test/playwright` now runs every page in UTC (`use.timezoneId: "UTC"`), so a date a spec expects renders the same on every machine. Set `use.timezoneId` on a project to test another zone.
