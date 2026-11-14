---
"@plumix/plugin-comments": patch
---

Fixes a cached comments response staying stale after its entry is published, unpublished or edited: the response now carries its entry's cache tag, so a change to the entry purges it. Needs `plumix` 0.28.0 or later.
