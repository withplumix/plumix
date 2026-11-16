---
"plumix": minor
---

Removes `defaultAuthenticator` and `apiTokenAuthenticator` from `plumix/auth`. A site's `auth({ authenticator })` now reads only people, from a session or an identity provider's assertion, and defaults to `sessionAuthenticator()`. Plumix reads an API token after it on every surface that takes one, so a site using `cfAccess(...)` or its own authenticator accepts tokens on RPC and plugin routes as it already did on REST, MCP and sync. Drop `apiTokenAuthenticator()` from your chain, replace `defaultAuthenticator()` with `sessionAuthenticator()`, and take `user:create_tokens` from your roles to turn tokens off.
