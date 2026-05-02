export interface OAuthClientConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface OAuthProfile {
  /** Provider-side stable user id. */
  readonly providerAccountId: string;
  readonly email: string;
  /**
   * Whether the provider asserts the email is verified. We refuse to
   * auto-link an OAuth identity to an existing local user unless the
   * provider has confirmed the address — without this any attacker who
   * controls the provider account could claim someone else's email.
   */
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

/**
 * Concrete, configured provider — what `auth({ oauth: { providers } })`
 * accepts. Built-ins (`github`, `google`) ship as factories that return
 * this shape; user-defined providers implement the same interface in
 * their own code and hand an instance to the same config slot. There's
 * no privileged registry — provider keys come from the user's config
 * map, and routes / admin UI / signup all read keys at runtime.
 */
export interface OAuthProviderClient {
  /**
   * Human-readable name shown on the login screen ("GitHub", "Google",
   * "Acme SSO"). Travels with the provider definition so adding a new
   * provider is one file, not "edit core + edit admin".
   */
  readonly label: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly userInfoUrl: string;
  readonly scopes: readonly string[];
  readonly client: OAuthClientConfig;

  /**
   * Translate the provider's userinfo JSON into a partial OAuthProfile.
   * Returning `email: null` is fine — the consumer will call
   * `fetchVerifiedEmail` (if defined) to resolve the missing address.
   */
  parseProfile(raw: unknown): Omit<OAuthProfile, "email" | "emailVerified"> & {
    email: string | null;
    emailVerified: boolean;
  };

  /**
   * Provider-specific authorize-URL params (Google's `access_type=offline`,
   * etc.). Called after the standard OAuth params are set; the provider
   * may add or override searchParams freely.
   */
  decorateAuthorizeUrl?(url: URL): void;

  /**
   * Resolve a verified primary email when `parseProfile` returned
   * `email: null`. GitHub needs this — its `/user` endpoint omits
   * email unless made public, but `/user/emails` always carries it.
   * Returning null here surfaces as `email_missing` to the user.
   */
  fetchVerifiedEmail?(
    accessToken: string,
  ): Promise<{ email: string; verified: boolean } | null>;
}

/**
 * Convenience alias for provider factories. Built-ins follow this shape;
 * users can write their own factories the same way.
 */
export type OAuthProviderFactory = (
  client: OAuthClientConfig,
) => OAuthProviderClient;

// Provider keys (the map keys in `auth.oauth.providers`) flow through the
// URL path and into the `oauth_accounts.provider` column. Constrain the
// shape to URL-path-safe identifiers so a typo can't smuggle special
// characters into routing or storage.
export const OAUTH_PROVIDER_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
