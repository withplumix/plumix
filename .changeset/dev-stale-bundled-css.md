---
"@plumix/core": patch
---

Stops `plumix dev` from emitting a stale bundled-CSS link on every page. A prior `plumix build` leaves the asset manifest on disk; its hashed stylesheet URLs are not served by the dev server, so each page view triggered one extra 404 request. Bundled CSS links now emit only in build — dev styling already arrives via the theme-styles client entry.
