---
"plumix": patch
---

Fixes cron matching of a day field that starts with `*` but is not a bare `*`, such as `*/2`. The field's own values used to be ignored. `0 0 */2 * *` fired every day and now fires on odd days. `0 0 */2 * MON` fired on every Monday and now fires on odd-dated Mondays, which is what Vixie cron does.
