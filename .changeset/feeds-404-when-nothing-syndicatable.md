---
"@plumix/plugin-feeds": patch
---

Fixes a feed serving an empty document instead of 404ing on a site where every public entry type declares an `access` policy.
