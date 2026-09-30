---
"@plumix/plugin-audit-log": patch
"@plumix/core": patch
---

Fixes the editor docs for scheduled retention. `retention` now says the plugin schedules the purge itself, and `purgeAt` says a custom schedule needs a matching trigger (on Cloudflare, an entry in `wrangler.jsonc` `triggers.crons`) or the purge never runs. `registerScheduledTask` now says a task with a `cron` runs only when a firing's schedule matches it exactly.
