---
"@plumix/core": patch
---

Fixes an email change leaving the user's outstanding sign-in links, invites and passkey registrations usable. Committing the change now revokes them along with the user's sessions.
