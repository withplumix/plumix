---
"@plumix/plugin-comments": patch
---

Fixes the comments REST collection serving approved replies the site hides: a reply under a pending, spam or trashed ancestor, or deeper than `maxDepth`, no longer appears, so the REST total now matches the thread's count.
