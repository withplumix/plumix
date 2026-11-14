---
"plumix": patch
---

Adds `sessionId` to a session's `AuthResult` and `ctx.credential`, and `auth.sessions.list`, `revoke` and `revokeOthers` find the current session from it rather than the cookie. A caller signed in by an identity provider such as Cloudflare Access has no current session, so `revokeOthers` now ends all of that user's sessions instead of none.
