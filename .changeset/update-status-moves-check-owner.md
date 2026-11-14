---
"@plumix/core": patch
---

Fixes `entry.update` changing an entry's status without the check of the procedure that owns that change. Leaving the trash through an update now needs what `entry.restore` needs, as entering it already needed what `entry.trash` needs.
