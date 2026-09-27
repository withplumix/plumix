---
"plumix": patch
---

Fixes the REST API returning entry titles with raw shortcodes such as `[year]`. `GET /_plumix/api/v1/<type>` and `/<type>/<id>` now return the title expanded, as the entry's own page shows it. Terms embedded in an entry, and the terms a template reads off a resolved entry, now come back in their assigned order.
