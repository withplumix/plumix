---
"@plumix/runtime-cloudflare": patch
---

Fix the demo sandbox serving a stale schema after a deploy that changes the database schema or seed.

The per-visitor and shared-showcase demo Durable Objects bootstrap their SQLite once and marked themselves ready with a version-agnostic flag, so a DO persisted from an earlier deploy never re-applied the newer bootstrap — any query touching a newly-added column then threw a 500 (e.g. `/authors/{slug}` after the author-archive `users.slug` column landed). The ready marker now records a version tag derived from the bootstrap SQL (schema migrations + seed); when a deploy changes that SQL, a stale DO drops its tables and re-applies the current bootstrap on its next request, healing itself with no manual reset. DOs carrying the old marker are treated as stale and re-bootstrap once.
