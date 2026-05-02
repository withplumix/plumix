export const OAUTH_PROVIDER_KEYS = ["github", "google"] as const;

export type OAuthProviderKey = (typeof OAUTH_PROVIDER_KEYS)[number];

export interface OAuthClientConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface OAuthProvidersConfig {
  readonly github?: OAuthClientConfig;
  readonly google?: OAuthClientConfig;
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

export interface OAuthProvider {
  readonly key: OAuthProviderKey;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly userInfoUrl: string;
  readonly scopes: readonly string[];
  /**
   * Translate the provider's profile JSON into the shared shape. Some
   * providers (GitHub) need a follow-up call to resolve the email — that
   * happens in the consumer, not here.
   */
  parseProfile(raw: unknown): Omit<OAuthProfile, "email" | "emailVerified"> & {
    email: string | null;
    emailVerified: boolean;
  };
}
