---
"@plumix/runtime-node": minor
---

Loads `.env` in production. The built server reads `.env` from the directory it starts in, before the site is built, and fills only the keys the environment has not set, so a platform's injected secrets always win; a missing file is not an error. A deploy that relied on a `.env` beside the server being ignored should remove the file or move its values into the environment. `.env` is now the one env file on every runtime: a project keeping local secrets in `.dev.vars` should rename it to `.env`.
