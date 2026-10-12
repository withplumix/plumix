---
"plumix": minor
---

Adds a `THIRD-PARTY-NOTICES.md` to every site build, in the client output and beside the server bundle, listing the licences of the dependencies each one bundles, and keeps those licence comments at the end of the site's plugin admin bundle. Turn the files off with `vite: { build: { license: false } }` in `plumix.config.ts`.
