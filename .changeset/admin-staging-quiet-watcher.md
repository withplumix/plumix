---
"plumix": patch
---

Fixes `plumix dev` printing `page reload` lines for the admin on every start. The admin is now staged outside `publicDir` and swapped in only when its files changed, so a restart or a config edit that leaves the admin as it was no longer wakes Vite's file watcher.
