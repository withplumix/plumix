---
"plumix": patch
---

Fixes the shared-cache gate reading the `plumix_session` cookie itself instead
of asking the configured authenticator. A site whose authenticator carries its
session on another signal — an SSO header, a tenant cookie — had every signed-in
render classified anonymous, so it was eligible to be stored under the public
URL and served on to the next visitor. `hasSession` already decided whether a
public render loads a user; it now decides cacheability too, on both the page
and the opted-in plugin-route paths.

The decision layer stays free of the auth surface: `requestIsPrivileged` takes
the verdict as a plain boolean the dispatcher resolves through
`requestHasSession`. Its bearer arm is unchanged and still stands on its own —
`apiTokenAuthenticator` reports no session on purpose, so that a GET never bumps
a token's `lastUsedAt`, yet its render is privileged all the same. An
authenticator that implements no `hasSession` still falls back to the standard
cookie, so the default install behaves exactly as before.

Expect a lower hit rate wherever the authenticator reports a session on ordinary
traffic. Those page renders now bypass the cache, and `cacheable: true` plugin
routes stop storing on them — correct, but a change an operator should see
coming rather than discover.
