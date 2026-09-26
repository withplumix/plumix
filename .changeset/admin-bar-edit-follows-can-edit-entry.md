---
"plumix": minor
---

Fixes the admin bar's Edit link to follow `canEditEntry`, so an author holding `edit_any` without `edit_own` is offered it. `admin_bar:nodes` contributors receive `queriedEntryDetails.canEdit` in place of `queriedEntryDetails.authorId`. Read `canEdit` instead of checking `entry:*` capabilities yourself.
