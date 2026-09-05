---
"@plumix/runtime-node": minor
---

Adds `plumix dev` for Node: one Vite server with the plumix plugin and a runnable `server` environment whose externals match the build. Vite's middlewares answer first and the last one bridges into the entry's `fetch`; an edit to the config, a theme or a plugin rebuilds the app on the next request, and a failing boot renders the dev boot-error page. A `.env` in the project root is applied to the process environment before the entry is imported and re-applied when it changes, with a variable the shell set winning; production loads nothing. Requests from a host other than loopback are refused unless `PLUMIX_DEV_ALLOW_REMOTE` is set. Accepts `--port` and `--host`.
