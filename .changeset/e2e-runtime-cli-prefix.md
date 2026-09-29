---
"plumix": minor
---

Adds an optional `cli` field to a runtime package's `plumix.e2e` block. When it is set, `definePlumixE2EConfig` runs a playground's `migrate generate`, `migrate apply` and `dev` steps through that command prefix instead of `pnpm exec plumix`, so a runtime whose CLI must run on another runtime, such as Bun, boots its playground the same way the other runtimes do.
