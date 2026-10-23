---
"plumix": minor
---

Adds `authClient.sessions.list()`, `.revoke(id)` and `.revokeOthers()`, so a theme's account page lists the signed-in user's sessions, marks the current one, and ends the others. Revoking the current session resolves `current_session`; end it with `signOut()`.
