---
"create-plumix-app": patch
"@plumix/runtime-node": patch
"@plumix/runtime-cloudflare": patch
---

Adds `start` to each runtime's `plumix.e2e` block, the command that serves its built output, and an optional `packageManager` to a runtime's scaffold block. The scaffold smoke reads both to install each runtime with its own package manager and to start every built server.
