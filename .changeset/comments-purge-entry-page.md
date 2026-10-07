---
"@plumix/plugin-comments": minor
---

Fixes approved, spammed, trashed and deleted comments staying stale on CDN-cached entry pages: every moderation write, and every comment that arrives approved, now purges the entry's cached page. Adds a `comment:deleted` action, fired with the comment as it stood before a moderator removed it.
