---
"plumix": patch
---

Fixes the runtime handler reading the `plumix_session` cookie directly to
decide `RequestScopedDbArgs.isAuthenticated`, instead of asking the configured
authenticator. A site whose authenticator carries its session on another
signal — an SSO header, its own cookie — always saw `false` here, which
silently disabled D1 Sessions read-your-writes: no bookmark resume on read, no
bookmark cookie on commit. A signed-in visitor could publish an entry and then
be served a lagging replica.

`isAuthenticated` now comes from `requestHasSession(app.authenticator,
request)` — the same helper the shared-cache gate already uses. A
bearer-only request still resolves to `false`, since `apiTokenAuthenticator`
reports no session and an API client has no browser to hold a bookmark
cookie. An authenticator that implements no `hasSession` falls back to the
standard cookie, so the default install is unchanged.
