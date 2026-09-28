---
"create-plumix-app": minor
"plumix": minor
---

Scaffolds `.env` as the local secrets file on every runtime, beside a committed `.env.example`, and lists `.env` in `.gitignore`. A Cloudflare project used to get `.dev.vars`; rename `.dev.vars` to `.env` in an existing one. The dev error page's missing-secret hint now names `.env`.
