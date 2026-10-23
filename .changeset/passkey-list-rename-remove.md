---
"plumix": minor
---

Adds `authClient.passkey.list()`, `rename(id, name)` and `remove(id)` to `plumix/auth/client`, so a theme's account page manages the signed-in user's own passkeys without posting raw RPC envelopes. Each resolves `{ data, error }`: another user's passkey resolves `not_found`, removing the only passkey resolves `last_credential`, and a runtime that refuses the passkeys area resolves `forbidden`. A sign-in method's browser half gets `kernel.rpc()` to call an RPC procedure as the session's user.
