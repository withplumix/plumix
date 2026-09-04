---
"plumix": patch
---

Fixes the bootstrap, login and accept-invite screens staying put after a successful passkey ceremony: the session is now refetched before navigating, so the route guard, which reads it with `staleTime: "static"`, sees the signed-in user.
