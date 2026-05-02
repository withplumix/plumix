import type { OAuthProvider } from "../types.js";

interface GitHubProfile {
  readonly id: number;
  readonly login: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly avatar_url: string | null;
}

interface GitHubEmail {
  readonly email: string;
  readonly primary: boolean;
  readonly verified: boolean;
}

export const github: OAuthProvider = {
  key: "github",
  authorizeUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",
  userInfoUrl: "https://api.github.com/user",
  scopes: ["read:user", "user:email"],
  parseProfile(raw) {
    const p = raw as GitHubProfile;
    return {
      providerAccountId: String(p.id),
      // GitHub's /user only exposes `email` when the user has marked one
      // public, and GitHub only allows publicising verified addresses —
      // so if `email` is non-null here, treat it as verified.
      email: p.email,
      emailVerified: p.email !== null,
      name: p.name ?? p.login,
      avatarUrl: p.avatar_url,
    };
  },
};

export interface PrimaryEmail {
  readonly email: string;
  readonly verified: boolean;
}

export async function fetchPrimaryEmail(
  accessToken: string,
): Promise<PrimaryEmail | null> {
  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "plumix",
    },
  });
  if (!response.ok) return null;
  const list = (await response.json()) as readonly GitHubEmail[];
  const primary = list.find((e) => e.primary) ?? list[0];
  if (!primary) return null;
  return { email: primary.email, verified: primary.verified };
}
