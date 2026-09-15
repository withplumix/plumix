---
"plumix": patch
---

Fixes the admin dashboard hiding a contributor's or author's own drafts. `entry.stats` and `entry.recentActivity` now apply the same visibility rule as the entries list, so a caller holding `edit_own` sees their own unpublished entries in the counts and the activity feed, and still never sees another user's. An entry type registered with a `capabilityType` that differs from its name no longer appears on the dashboard, matching the entries list and search.
