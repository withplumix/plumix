---
"@plumix/runtime-cloudflare": minor
---

Fixes a cron firing whose tasks failed being recorded as a successful Worker invocation. The generated entry now reads the scheduled run report and throws, so the Cron Trigger Past Events table and Workers analytics agree with the logs. A firing where some tasks succeeded declines Cloudflare's retry, since a replay would re-run them; one where nothing succeeded keeps it.
