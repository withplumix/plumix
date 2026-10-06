import type { OAuthProviderClient } from "../auth/contract/oauth.js";
import type { PasskeyConfig } from "../auth/contract/passkey.js";
import type { SessionPolicy } from "../auth/contract/sessions.js";
import type { UserRole } from "../db/schema/users.js";
import type { RequestAuthenticator } from "./authenticator.js";

// The `auth` config slot. Declared beside the context rather than in
// `auth/contract/`: `config.ts` names it, and it names the
// `RequestAuthenticator` declared here, so a home under `auth/` would tie the
// two subsystems into a cycle.

export interface PlumixMagicLinkConfig {
  /**
   * Site name shown in the email subject + body ("Sign in to {siteName}").
   * Required so the operator picks the user-visible string explicitly —
   * the alternative (silently falling back to `passkey.rpName`) couples
   * config blocks in a non-obvious way.
   */
  readonly siteName: string;
  /**
   * Token lifetime in seconds. Defaults to 15 minutes (900) — the
   * Copenhagen Book / emdash convention. Lower for paranoid deploys.
   */
  readonly ttlSeconds?: number;
}

export interface PlumixOAuthConfig {
  /**
   * Map of provider keys → configured provider clients. The map key
   * doubles as the URL path segment (`/_plumix/auth/oauth/<key>/start`)
   * and the value of `oauth_accounts.provider` for any user that signs
   * in via this provider. Pass instances from `github(creds)` /
   * `google(creds)` (built-ins) or from your own factory implementing
   * `OAuthProviderClient` for provider parity.
   */
  readonly providers: Readonly<Record<string, OAuthProviderClient>>;
}

export type BootstrapVia = "passkey" | "first-method-wins";

export interface PlumixSelfSignupConfig {
  /**
   * Role every self-provisioned user is granted. Present = open
   * self-signup: the built-in magic-link and OAuth signup paths stop
   * consulting `allowed_domains` and mint new users at this role
   * directly. Absent (default) = today's domain-gated behaviour.
   *
   * Kept explicit — never defaulted — because it decides how much
   * authority "anyone with an email" receives. `"subscriber"` is the
   * intended choice (authenticated but off the admin capability ladder);
   * a privileged role here hands the admin to the public, so the
   * operator states it deliberately.
   *
   * Note the allowlist is bypassed wholesale, not merged: while open,
   * even an email whose domain has an `allowed_domains` rule granting a
   * higher role is provisioned at `defaultRole`. Per-inbox abuse limits
   * are the edge/runtime's job — the built-in per-email issuance cap
   * bounds one address, not aliases of it (`user+tag@…`) or account
   * volume across many addresses.
   */
  readonly defaultRole: UserRole;
}

export interface PlumixAuthInput {
  readonly passkey: PasskeyConfig;
  readonly sessions?: SessionPolicy;
  readonly oauth?: PlumixOAuthConfig;
  readonly magicLink?: PlumixMagicLinkConfig;
  /**
   * Request-level authenticator. Decides "who is this user" on every request.
   * Defaults to `defaultAuthenticator()` — a chain of
   * `sessionAuthenticator()` (cookie) followed by
   * `apiTokenAuthenticator()` (Authorization: Bearer pl_pat_…).
   * Browser admins and CLI / MCP clients both authenticate out of
   * the box without operator config.
   *
   * Override for transparent SSO — e.g. `cfAccess({ teamDomain })` from
   * `@plumix/runtime-cloudflare`, where the edge sets a JWT header on
   * every request. The built-in login routes (passkey / oauth /
   * magic-link) remain mounted regardless: operators that want them
   * disabled when an external authenticator owns the session should
   * firewall `/_plumix/auth/*` at the edge (e.g. a Cloudflare Access
   * policy on those paths). Leaving them live by default supports
   * deploys that mix transparent SSO with passkey-as-backup.
   *
   * If you override and still want bearer-token auth alongside, wrap
   * yours in `chainAuthenticators(yourAuthenticator, apiTokenAuthenticator())`.
   */
  readonly authenticator?: RequestAuthenticator;
  /**
   * How the very first admin enrols on a fresh deploy.
   *
   * - `"passkey"` (default) — magic-link and OAuth signup are refused
   *   while the users table is empty. The first admin must enrol via
   *   the dedicated passkey bootstrap rail. Phishing-resistant; no
   *   external dependency.
   *
   * - `"first-method-wins"` — any verified external flow (magic-link,
   *   OAuth, custom authenticator) can mint the first admin via the
   *   atomic CASE-WHEN-COUNT election in `provisionUser`. Use when the
   *   runtime layer already gates who reaches plumix (Cloudflare Access
   *   in front, SAML at the edge, internal-only deploy) — the gate is
   *   "can the JWT be issued at all", not "can plumix see any user".
   */
  readonly bootstrapVia?: BootstrapVia;
  /**
   * Open public registration (see {@link PlumixSelfSignupConfig}). Omit
   * (default) to keep signup gated to `allowed_domains`. Enabling it turns
   * the magic-link request endpoint into a public signup surface, so
   * issuance stays rate-limited and timing-uniform underneath.
   */
  readonly selfSignup?: PlumixSelfSignupConfig;
  /**
   * Where an access policy's `redirectToLogin()` sends an anonymous visitor.
   * A root-relative path; the framework appends `?redirectTo=<current URL>` so
   * the honouring sign-in flow returns the visitor afterwards. Defaults to the
   * admin login (`/_plumix/admin/login`) — set it to a theme-owned login page
   * so gated visitors sign in on the site rather than in the CMS.
   *
   * The sign-in flows land here too, with a query parameter the page reads to
   * render the outcome: a failed magic link (`magic_link_error=<code>`), a
   * failed OAuth callback (`oauth_error=<code>`) and an email-change
   * confirmation (`email_change_error=<code>` or `email_change_success=1`).
   *
   * Point it at a page that is itself un-policied: a `loginPath` under a gated
   * entry type would bounce an anonymous visitor from the gate to the login and
   * straight back into the gate — a redirect loop. The default is un-policied.
   */
  readonly loginPath?: string;
}

export interface PlumixAuthConfig extends PlumixAuthInput {
  readonly kind: "plumix";
}
