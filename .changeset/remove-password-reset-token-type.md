---
"plumix": minor
---

Removes the unused `password_reset` auth token type from `AUTH_TOKEN_TYPES` and `AuthTokenType` in `plumix/schema`. Plumix has no password sign-in, and nothing ever issued this token.
