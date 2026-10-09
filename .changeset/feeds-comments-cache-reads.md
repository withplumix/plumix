---
"@plumix/plugin-feeds": patch
"@plumix/plugin-comments": patch
---

Moves onto `recordRead` and `recordWrite`. A cached feed is cleared by a save of the `site` settings group through the settings read it already records, and a comment write purges exactly the cached pages that rendered its thread. Requires plumix 0.25.0.
