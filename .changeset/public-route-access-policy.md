---
"plumix": minor
---

Adds an `access` option to `registerPublicRoute`, taking the same access policy `registerArchiveType` does. A policied public route loads the principal and resolves the policy before its handler runs: a reader the gate refuses gets the gate's redirect or challenge response, and one it admits reaches the handler with `ctx.user` loaded and `ctx.access` set. A policied route never reads from or writes to the CDN, even with `cacheable: true`, and a response for any segment other than `anonymous` is sent `private, no-store` with `Vary: Cookie`. A public route without `access` behaves as before.
