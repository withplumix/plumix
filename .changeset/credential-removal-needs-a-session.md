---
"@plumix/core": patch
---

Requires a signed-in session to revoke an API token, a session, a passkey, an OAuth link or an OAuth grant. A caller signed in with an API token now gets `UNAUTHORIZED` from these procedures.
