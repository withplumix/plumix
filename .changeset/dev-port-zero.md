---
"plumix": minor
---

Lets `plumix dev --port 0`, and `--inspector-port 0` on Cloudflare, leave the OS to pick a free port; the dev server prints the one it bound. Both flags rejected `0` as out of range.
