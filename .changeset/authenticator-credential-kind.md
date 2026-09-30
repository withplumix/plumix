---
"plumix": minor
---

Adds a required `credential` field to `AuthResult`: a custom `RequestAuthenticator` must now return `credential: "session"` for a browser-bound identity, or `credential: "api-token"` with its `tokenScopes`. Fixes passkey add-device for users signed in through a non-cookie authenticator such as `cfAccess`, who could not enrol a backup passkey. An API-token caller can no longer enrol a passkey.
