---
"@plumix/core": patch
"@plumix/plugin-audit-log": patch
"@plumix/plugin-forms": patch
"@plumix/runtime-cloudflare": patch
---

Removes the last single-runtime leanings that don't depend on the new handler
contract. The audit-log cursor now encodes with Web APIs instead of Node's
`Buffer`; core's dead, unused `node:fs` catalog loader is gone; the
undeclared-binding dev-error hint is registered by `@plumix/runtime-cloudflare`
instead of core, so it no longer appears on non-Cloudflare deploys; and
scheduled-task cron docstrings describe the runtime as responsible for firing
the schedule instead of naming `wrangler` configuration.
