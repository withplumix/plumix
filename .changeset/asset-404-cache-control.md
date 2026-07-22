---
"@plumix/core": patch
---

Static-asset 404s (the short-circuit for `favicon.ico`, `/assets/*` and friends) now carry `Cache-Control: public, max-age=300`, so browsers and CDNs absorb repeated probes instead of invoking the worker each time. Safe to cache because the extension check makes these paths permanently unroutable; the TTL only bounds how long a freshly deployed asset can be shadowed. Content 404s remain uncacheable.
