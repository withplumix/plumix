---
"@plumix/plugin-search": patch
"@plumix/plugin-media": patch
"@plumix/plugin-audit-log": patch
---

Subscribes to the `entry` and `term` events rather than the removed `entry:*` and `term:*` string names, so these plugins need `plumix` 0.27.0 or later. Search still reindexes on the same writes, media still removes an upload's variants when it is trashed or deleted, and the audit log records the same rows under the same event names.
