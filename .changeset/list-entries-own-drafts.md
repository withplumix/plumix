---
"@plumix/core": patch
---

Fixes the admin entries list hiding a contributor's or author's own drafts: `entry.list` now admits the caller's own unpublished entries when they hold `edit_own`, so the "Draft" and "Trash" filters return their own rather than an empty list. One visibility rule now answers `entry.get`, `entry.list`, the REST collection and the admin search palette.
