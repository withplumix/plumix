---
"@plumix/runtime-node": patch
---

`plumix dev` now releases the database connection a replaced site's handler bound. Each edit that invalidated the entry built a new site and left the old handler's connection open. A reload now disposes the replaced site in the background: its deferred work finishes, then that connection closes.
