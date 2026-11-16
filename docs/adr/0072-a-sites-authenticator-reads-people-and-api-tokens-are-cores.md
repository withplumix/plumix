# A site's authenticator reads people; API tokens are core's

`auth({ authenticator })` mixed two things: how people are read (Plumix's
session cookie, or an identity provider's assertion such as `cfAccess`) and
whether API tokens are accepted. Each surface treated that mix differently
(#3744). `defaultAuthenticator()` chained the session reader and
`apiTokenAuthenticator()`, and its doc said `sessionAuthenticator()` alone
turned tokens off. That held only for RPC and plugin routes. REST, MCP and
`plumix sync` use the `bearer` policy, which builds its own token reader and
accepted tokens whatever the site configured. A site that wrote
`authenticator: cfAccess(...)` had to remember to chain
`apiTokenAuthenticator()` itself, and when it forgot, tokens stopped working
on RPC while they kept working on REST, MCP and sync.

Plumix already treats tokens as its own credential. VISION's agent and API
client actors reach the site "with an API token", and every way to mint one is
core's and needs `user:create_tokens` (#3743). Laravel Sanctum, Strapi,
Directus, Ghost and WordPress Application Passwords all keep tokens apart from
the login or SSO provider.

> **A site's authenticator reads people, from a session or an identity
> provider's assertion. API tokens are core's credential: core reads one after
> the site's authenticator on every surface that takes a token. A site turns
> tokens off through its roles, never by leaving the reader out.**

## What this means

- **The default reads sessions only.** `auth.authenticator` defaults to
  `sessionAuthenticator(sessions)`. A site adding an identity provider chains
  it beside sessions with `chainAuthenticators`, and never names a token
  reader.
- **Core chains the token reader.** `siteAuthenticator` in
  `auth/authenticator.ts` chains the site's authenticator, then the API-token
  reader that refuses an audience-bound token. The runtime builds the app's
  authenticator through it, so RPC, plugin routes and the admin read a token
  after the person. A request carrying both resolves as the person, as before.
- **Bearer surfaces stay token-only.** REST, MCP and `plumix sync` keep the
  `bearer` policy, which reads a token alone and runs ahead of the CSRF gate.
- **The public surface shrinks.** `plumix/auth` no longer exports
  `defaultAuthenticator` or `apiTokenAuthenticator`. TypeScript reports every
  site that imported them. `sessionAuthenticator` and `chainAuthenticators`
  stay.
- **Turning tokens off is a role decision.** Taking `user:create_tokens` from
  every role stops minting and stops every existing token at its next request.
  There is no flag.
- **ADR 0024 holds.** A token read this way is still an `"api-token"`
  credential, so a surface that creates a credential refuses it
  ([ADR 0024](0024-a-credential-is-created-only-from-a-session.md)).

## Considered options

- **Make tokens switchable on every surface** (rejected). A new option that
  turns the token reader off everywhere would make the surfaces agree, but no
  site has asked to accept tokens on one surface and not another, and roles
  already turn tokens off.
- **Keep the split and fix the doc** (rejected). The doc would be true, but a
  site that sets its own authenticator would still lose tokens on RPC and keep
  them on REST, MCP and sync. That is the trap this ADR removes.
