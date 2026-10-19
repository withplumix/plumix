---
"@plumix/runtime-cloudflare": minor
---

Adds `plumix sync pull|push` and `plumix import --url` on Cloudflare. The local end is the D1 database and storage `plumix dev` uses; the deployed end is the database `--production`, `--preview` or `--env <name>` names, resolved as `plumix migrate` resolves it. A pull exports through D1's export API, a push imports one script through D1's import API after taking a Time Travel bookmark it prints the restore command for, and the `media` scope copies the storage slot's objects. Requires `plumix` 0.26.
