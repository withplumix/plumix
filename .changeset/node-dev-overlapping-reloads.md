---
"@plumix/runtime-node": patch
---

Fixes `plumix dev` leaving a scheduler running when two reloads overlap. A request that arrived while an earlier reload was still importing started a second load, and whichever finished last took over, so the other load's scheduler kept firing against the app it was built for until the process exited. A load that a newer one overtook now stops its scheduler and hands the requests waiting on it to the newest site. One that fails no longer shows its error or forces a rebuild that tears down the site that just loaded.
