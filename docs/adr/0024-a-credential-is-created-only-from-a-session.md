# A credential is created only from a session

#2451 found passkey add-device deciding who was registering with its own
cookie lookup. Every other authenticated surface asks the configured
authenticator. Under `cfAccess({ teamDomain })`, or any authenticator that
mints no `plumix_session` cookie, a signed-in user looked anonymous and got
`registration_closed`. So the backup passkey the `authenticator` config
promises could not be enrolled.

Asking the configured authenticator instead exposes the opposite problem.
`defaultAuthenticator()` also resolves API tokens. An API-token holder could
enrol a passkey they generated themselves, and `register/verify` would mint a
full session for it. A scoped, revocable token would become a full-capability
login that survives revoking the token.

The route needs to know what kind of credential resolved the caller, and only
the authenticator knows that.

> **A surface that creates a credential or a session for the caller admits
> only a session credential. An API-token caller counts as anonymous there.**

## What this means

- **The authenticator says what it resolved.** `AuthResult` is a union on a
  required `credential` field. `"session"` is a credential binding a browser
  to the user: Plumix's own cookie, or an IdP assertion such as Cloudflare
  Access. `"api-token"` is a credential that carries its own scopes, and only
  it has `tokenScopes`.
- **Required, so it fails to compile.** A custom authenticator that doesn't
  declare `credential` is a type error. An untyped JS one that omits it
  resolves no one, so it is refused rather than let through.
- **The context carries the credential.** `resolvePrincipal(ctx, policy)` in
  `auth/principal.ts` resolves a request's principal once and returns the
  context carrying it, with `ctx.credential` set to `{ kind: "session" }` or
  `{ kind: "api-token", token, scopes }`. Every other builder of a principal
  (`withUser`, MCP's dev loopback, the test site's `actingAs`) names the kind
  too, with no default. A context that already carries a principal is never
  resolved again, so its credential kind is the one fact a later check reads.
- **The session policy names the rule.** `{ kind: "session" }` admits a
  principal only when `credential.kind === "session"`, whether it resolves the
  request or finds the principal already on the context. The
  `sessionAuthenticated` middleware in `rpc/authenticated.ts` uses it, so an
  API-token context is refused however it reached the procedure: over the
  wire, from an MCP tool, or through a nested `createRouterClient` call. It
  guards `auth.apiTokens.create`, `auth.deviceFlow.approve`,
  `auth.oauthConsent.lookup`, `auth.oauthConsent.approve` and
  `user.requestEmailChange`, and stays internal to core until a plugin needs
  it. Passkey add-device and OAuth's `/authorize`, which need the whole user
  row, call `authenticateSession(ctx)` in `auth/authenticator.ts`, which
  applies the same key.
- **Capability checks are unchanged.** `ctx.tokenScopes` is the API token's
  scopes and `null` for a session, and `ctx.auth.can` intersects them with the
  role's capabilities.

## Considered options

- **Key on `hasBearerToken`** (rejected). That checks how a credential
  arrived, not what it is. A custom SSO authenticator reading a bearer JWT
  would be refused, and a custom token authenticator reading `X-API-Key`
  would get through.
- **Key on `tokenScopes` being present or `null`** (rejected). An unscoped
  token has `tokenScopes: null`, the same as a session, so it would get
  through. `undefined` against `null` is too fragile to carry the
  distinction.
- **Key on `hasSession`** (rejected). The default chain's `hasSession` is a
  `some(...)`, so a junk `plumix_session` cookie satisfies it, and then the
  chain resolves the API token that came with it.
