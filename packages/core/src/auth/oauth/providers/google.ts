import type { OAuthProvider } from "../types.js";

interface GoogleProfile {
  readonly sub: string;
  readonly email: string;
  readonly email_verified: boolean;
  readonly name: string | null;
  readonly picture: string | null;
}

export const google: OAuthProvider = {
  key: "google",
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  scopes: ["openid", "email", "profile"],
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
};
