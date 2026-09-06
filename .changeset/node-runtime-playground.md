---
"@plumix/runtime-node": patch
---

Declares the `plumix.e2e` block (`data/` wiped before a run, the database at `data/*.sqlite`) and ships a playground that runs the shared runtime spec through `plumix dev` — bootstrap, publish, public read, media upload, sign out — so Node and Cloudflare are proven by the same assertions. Adds the one case only Node has: an edit to the playground config while the server runs is served on the next request.

`plumix dev` now serves the staged tree from disk ahead of Vite. Vite answers `publicDir` from a listing taken once at startup and repaired by watcher events, so an admin chunk staged after that listing could be missing from the set for the life of the server; Vite passed the request on, and the dispatcher answered an asset-shaped path at the root base with a 404 without ever reading the disk.
