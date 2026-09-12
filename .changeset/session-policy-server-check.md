---
"@plumix/core": patch
---

Fixes `auth.sessions` applying only to the session cookie: the server-side session check now enforces the configured `maxAgeSeconds`, `absoluteMaxAgeSeconds` and `refreshThreshold` instead of the defaults. `sessionAuthenticator()` and `defaultAuthenticator()` accept the policy for operators who compose their own authenticator chain.
