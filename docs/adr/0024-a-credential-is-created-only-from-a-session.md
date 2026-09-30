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

> **A surface that creates a credential or a session for the caller resolves
> the caller with `authenticateSession`. An API-token caller counts as
> anonymous there.**

## What this means

- **The authenticator says what it resolved.** `AuthResult` is a union on a
  required `credential` field. `"session"` is a credential binding a browser
  to the user: Plumix's own cookie, or an IdP assertion such as Cloudflare
  Access. `"api-token"` is a credential that carries its own scopes, and only
  it has `tokenScopes`.
- **Required, so it fails to compile.** A custom authenticator that doesn't
  declare `credential` is a type error. An untyped JS one that omits it reads
  as no session to `authenticateSession`, so it is refused rather than let
  through.
- **One helper names the rule.** `authenticateSession(ctx)` in
  `auth/authenticator.ts` runs the configured authenticator and returns the
  result only when `credential === "session"`. Passkey add-device is its
  first caller. It stays internal to core until a plugin needs it.
- **Scopes are read through one helper.** `tokenScopesOf(result)` returns an
  API token's scopes and `null` for a session. Capability checks are
  unchanged.

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

## Still to adopt

These surfaces create a credential for the caller and do not resolve it
through `authenticateSession` yet. Each is its own follow-up.

- `auth.apiTokens.create`. A scoped token may be able to mint a wider one.
  This is unverified.
- Email change.
