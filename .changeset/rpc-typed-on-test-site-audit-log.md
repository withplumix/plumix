---
"@plumix/plugin-audit-log": minor
---

Declares the plugin's RPC router in its descriptor's type, so a test site that installs it lists its procedures on `site.rpc.audit_log`. `@orpc/server` moves to the plugin's dependencies, since its published types now name it.
