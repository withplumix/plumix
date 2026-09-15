---
"@plumix/core": patch
---

Fixes stale edge-cached pages after user changes: deleting a user now purges cached pages such as their author feed, and user updates now also purge cached permalinks of hierarchical types like pages.
