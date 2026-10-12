---
"@plumix/core": minor
---

Loads the principal for a signed-in request to a public route a plugin registered without an `access` policy. The handler now sees that reader's `ctx.user`, and the response is rendered live, neither read from nor stored in the CDN, and sent `private, no-store`. Anonymous requests are cached as before.
