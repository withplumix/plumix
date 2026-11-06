---
"@plumix/plugin-seo": patch
"@plumix/plugin-audit-log": patch
---

Subscribes through the `settings` subject rather than the removed `settings:group_changed` and `rpc:settings.*` string names. Reading the SEO settings group still fills in the answers a site gave before the group existed, and the audit log still records a settings change under `settings:group_changed`, with key names only.
