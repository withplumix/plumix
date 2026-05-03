import type {
  OAuthClientConfig,
  OAuthProviderClient,
  OAuthProviderFactory,
} from "../types.js";

interface GoogleProfile {
  readonly sub: string;
  readonly email: string;
  readonly email_verified: boolean;
  readonly name: string | null;
  readonly picture: string | null;
}

export const google: OAuthProviderFactory = (
  client: OAuthClientConfig,
): OAuthProviderClient => ({
  label: "Google",
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  scopes: ["openid", "email", "profile"],
  client,
  parseProfile(raw) {
    const p = raw as GoogleProfile;
    return {
      providerAccountId: p.sub,
      email: p.email,
      emailVerified: Boolean(p.email_verified),
      name: p.name,
      avatarUrl: p.picture,
    };
  },
  decorateAuthorizeUrl(url) {
    // Google needs `access_type=offline` + `prompt=consent` to surface
    // `email_verified` on the userinfo endpoint for accounts that
    // aren't currently signed in. Harmless for repeat sign-ins.
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  },
});
