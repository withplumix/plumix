import type { OAuthProviderClient } from "../auth/contract/oauth.js";
import type { PasskeyConfig } from "../auth/contract/passkey.js";
import type { SessionPolicy } from "../auth/contract/sessions.js";
import type { UserRole } from "../db/schema/users.js";
import type { RequestAuthenticator } from "./authenticator.js";

/**
 * Not under `auth/contract/`: it names the `RequestAuthenticator` declared
 * here, and `config.ts` names it, so that home would form an import cycle.
 */
export interface PlumixMagicLinkConfig {
  /**
   * Shown in the email ("Sign in to {siteName}"); never falls back to
   * `passkey.rpName`.
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
   * The key is also the URL segment (`/_plumix/auth/oauth/<key>/start`) and the
   * stored `oauth_accounts.provider`, so renaming it orphans linked accounts.
   */
  readonly providers: Readonly<Record<string, OAuthProviderClient>>;
}

export type BootstrapVia = "passkey" | "first-method-wins";

export interface PlumixSelfSignupConfig {
  /**
   * Never defaulted: it decides what "anyone with an email" gets, so prefer
   * `"subscriber"`. Bypasses `allowed_domains` wholesale, even rules granting
   * a higher role.
   */
  readonly defaultRole: UserRole;
}

export interface PlumixAuthInput {
  readonly passkey: PasskeyConfig;
  readonly sessions?: SessionPolicy;
  readonly oauth?: PlumixOAuthConfig;
  readonly magicLink?: PlumixMagicLinkConfig;
  /**
   * Replacing it drops bearer tokens unless you chain
   * `apiTokenAuthenticator()`. The built-in login routes stay mounted; firewall
   * `/_plumix/auth/*` at the edge to disable them.
   */
  readonly authenticator?: RequestAuthenticator;
  /**
   * `"passkey"` (default) refuses external signup while no user exists.
   * `"first-method-wins"` lets any verified flow mint the first admin; use it
   * only behind an edge gate.
   */
  readonly bootstrapVia?: BootstrapVia;
  /** Omit to keep signup gated to `allowed_domains`. */
  readonly selfSignup?: PlumixSelfSignupConfig;
  /**
   * Root-relative; gets `?redirectTo=`, plus `magic_link_error`, `oauth_error`,
   * `email_change_error` or `email_change_success` from sign-in flows. Must be
   * un-policied, or gated visitors loop.
   */
  readonly loginPath?: string;
}

export interface PlumixAuthConfig extends PlumixAuthInput {
  readonly kind: "plumix";
}
