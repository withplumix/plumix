---
"@plumix/plugin-feeds": minor
---

Adds feeds for entry types with an `access` policy. Each feed lists the entries its reader may see: an anonymous reader gets the public ones, from a feed the CDN caches, and a signed-in reader gets their own, served privately. A soft-gated entry's item carries its excerpt and never its body.
