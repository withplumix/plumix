import type { EnvInput } from "../../runtime/contract/env-input.js";

export interface OAuthClientConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

// The secret is used at token exchange, so on Workers it must come from the
// per-request `env`.
type OAuthClientInput = EnvInput<OAuthClientConfig>;

export interface OAuthProfile {
  /** Provider-side stable user id. */
  readonly providerAccountId: string;
  readonly email: string;
  /**
   * Auto-linking to an existing user requires this, or a provider account could
   * claim someone else's email.
   */
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

export interface OAuthProviderClient {
  /** Shown on the login screen. */
  readonly label: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly userInfoUrl: string;
  readonly scopes: readonly string[];
  readonly client: OAuthClientInput;

  /** Returning `email: null` defers to `fetchVerifiedEmail`, when defined. */
  parseProfile(raw: unknown): Omit<OAuthProfile, "email" | "emailVerified"> & {
    email: string | null;
    emailVerified: boolean;
  };

  /** Runs after the standard OAuth params are set, so it may override them. */
  decorateAuthorizeUrl?(url: URL): void;

  /**
   * Called only when `parseProfile` returned `email: null`; returning null
   * surfaces `email_missing`.
   */
  fetchVerifiedEmail?(
    accessToken: string,
  ): Promise<{ email: string; verified: boolean } | null>;
}

export type OAuthProviderFactory = (
  client: OAuthClientInput,
) => OAuthProviderClient;

// Provider keys become a URL path segment and the `oauth_accounts.provider`
// column, so they must be path-safe.
export const OAUTH_PROVIDER_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
