---
"plumix": minor
---

Adds `site.logger` and `site.telemetry` to the test site from `plumix/test`. `site.logger` records every line the site logged, with `assertLogged(level, message)` and `assertNothingLogged(level)`, so a test no longer builds a capturing logger. `site.telemetry` records each request's and scheduled firing's telemetry snapshot in place of the config's own consumers, and `site.telemetry.span(name)` finds a recorded span so a test can read its attributes. `site.visit` and `site.rpc` now settle the work a request deferred before they resolve.
