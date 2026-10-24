---
"@plumix/core": patch
---

Fixes `auth.apiTokens.create`, `auth.deviceFlow.approve` and `user.requestEmailChange` accepting an API-token caller. They now need a signed-in session, and an API-token request gets `UNAUTHORIZED`.
