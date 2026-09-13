---
"@plumix/core": patch
"@plumix/runtime-node": patch
---

Widens `runScheduledTasks`, `scheduledTasksFor`, `declaredSchedules` and `connectScheduledDb`, and the `app` option of the Node runtime's `startScheduledRunner`, to accept any object carrying the app fields they read (`scheduledTasks`, or `schema` plus `config.database`) rather than a whole `PlumixApp`. Code passing a full app keeps working.
