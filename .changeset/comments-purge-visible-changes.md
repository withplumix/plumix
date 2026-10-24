---
"@plumix/plugin-comments": minor
---

Purges a comment's entry page only when visitors would see the change: a comment is approved or restored to approved, an approved comment is spammed, trashed or deleted, or a new comment arrives approved. Moving a comment between held, spam and trash now leaves the page cached, and an approval no longer purges other pages stored under the entry. Requires `plumix` 0.27.0 or later.
