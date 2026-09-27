---
"plumix": minor
---

Adds `isSlotConfigured(slot)` and `basePath()` to `plumix/admin`, so plugin admin code can ask whether the site's `plumix()` config fills an infrastructure slot (`storage`, `imageDelivery`, `kv`, `cdn`, `mailer`) and read the subdirectory mount without casting `window.plumix`. The plugin manifest now carries `configuredSlots`. On a site with no `mailer` slot, the admin no longer lists **Mailer**, and `/mailer` explains that outbound email needs a `mailer:` slot instead of offering a test send that can only fail.
