interface OAuthProviderSummary {
  // Map key in `auth.oauth.providers`; the URL path segment.
  readonly key: string;
  readonly label: string;
}

export interface AuthMethodsSummary {
  /** Passkey is always configured, so this is always `true` today. */
  readonly passkey: boolean;
  /** True when `auth.magicLink` is configured. */
  readonly magicLink: boolean;
  /** `{ key, label }` per configured OAuth provider; empty when none. */
  readonly oauth: readonly OAuthProviderSummary[];
}
