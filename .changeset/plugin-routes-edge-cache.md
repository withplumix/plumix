---
"@plumix/runtime-cloudflare": minor
"@plumix/core": minor
---

Adds an edge-cache opt-in for plugin routes: `registerRoute({ cacheable: true })` serves a public
raw route through the edge cache instead of running its handler on every request. A response that
sets its own `Cache-Control` now keeps that freshness through storage — an immutable
content-addressed asset stays immutable — and the configured page TTL applies only to responses
that set none.
