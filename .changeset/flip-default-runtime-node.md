---
"create-plumix-app": minor
---

**Breaking:** `create-plumix-app` with no `--runtime` flag now scaffolds a
`node` project instead of `cloudflare`. A fresh site runs as a plain Node.js
process against SQLite on disk, with no platform account and nothing to sign
up for. `--runtime cloudflare` is unchanged and still scaffolds a Cloudflare
Worker on D1.
