---
"@plumix/core": minor
---

Passes the sign-out request to `RequestAuthenticator.signOutUrl(request)`, and `chainAuthenticators` forwards it to each member, so an authenticator can return its logout URL only for a request that carries its own credential. Implementations that take no argument keep working.
