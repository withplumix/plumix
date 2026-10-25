---
"plumix": minor
---

Adds `now()` to `plumix/support`, the current time as core reads it, and `site.travel({ days, hours, minutes })` and `site.freezeTime(iso)` to the test site from `plumix/test`. Moving a test site's clock moves only that site's time: session expiry and scheduled publishing follow it, while other sites and code outside a site keep real time.
