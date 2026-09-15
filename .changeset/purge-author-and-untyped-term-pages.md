---
"@plumix/core": patch
---

Fixes stale edge-cached pages after two content changes. Updating a user now purges cached author archives and the feeds that show an author's name. Changing a term in a taxonomy registered without `entryTypes` now purges its cached term archive and term feed, which are stored under the public entry types' tags instead of none.
