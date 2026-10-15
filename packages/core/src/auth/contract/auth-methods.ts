export interface AuthMethodsSummary {
  /** The listed sign-in methods: core's, then each plugin's in plugin order. */
  readonly methods: readonly {
    readonly name: string;
    readonly label: string;
  }[];
  /** `{ key, label }` per configured OAuth provider; empty when none. */
  readonly oauth: readonly {
    /** Map key in `auth.oauth.providers`; the URL path segment. */
    readonly key: string;
    readonly label: string;
  }[];
}
