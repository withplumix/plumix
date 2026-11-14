---
"@plumix/runtime-cloudflare": patch
---

Speeds up requests with D1 sessions on: each request's database now reuses the schema's relational config instead of deriving it again.
