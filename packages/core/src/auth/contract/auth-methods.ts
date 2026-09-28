interface OAuthProviderSummary {
  /** Map key in `auth.oauth.providers`; the URL path segment. */
  readonly key: string;
  /** Human-readable name for the login button ("GitHub", "Google", …). */
  readonly label: string;
}

/**
 * The configured auth methods, projected from `auth({ … })` config for a theme
 * to render its own login/registration controls. The theme-side analog of the
 * admin login's provider list: a custom login page reads this (via
 * `useAuthMethods()`) and shows a button per enabled method, so adding or
 * removing a method in config changes the page with no theme code change.
 */
export interface AuthMethodsSummary {
  /** Passkey is always configured, so this is always `true` today. */
  readonly passkey: boolean;
  /** True when `auth.magicLink` is configured. */
  readonly magicLink: boolean;
  /** `{ key, label }` per configured OAuth provider; empty when none. */
  readonly oauth: readonly OAuthProviderSummary[];
}
