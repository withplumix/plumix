import type { Db } from "../../context/app.js";
import type { User, UserRole } from "../../db/schema/users.js";
import type { OAuthProfile, OAuthProviderKey } from "./types.js";
import { and, eq } from "../../db/index.js";
import { allowedDomains } from "../../db/schema/allowed_domains.js";
import { oauthAccounts } from "../../db/schema/oauth_accounts.js";
import { users } from "../../db/schema/users.js";
import { OAuthError } from "./errors.js";

export interface ResolveOAuthUserInput {
  readonly provider: OAuthProviderKey;
  readonly profile: OAuthProfile;
}

export interface ResolvedOAuthUser {
  readonly user: User;
  /** True when this call provisioned a new user row. */
  readonly created: boolean;
  /** True when this call linked an existing user to the OAuth account. */
  readonly linked: boolean;
}

/**
 * Decide who an OAuth callback maps to:
 *   1. If `oauth_accounts(provider, providerAccountId)` already points to a
 *      user, that's the answer (modulo disabled check). Pure sign-in.
 *   2. Else if a user exists with the same email AND the provider verified
 *      that email, link the OAuth account into the existing user row.
 *      Refusing the unverified case prevents takeover via a third-party
 *      account that controls the email string but not the inbox.
 *   3. Else look up `allowed_domains` for the email's domain. If enabled,
 *      provision a new user with the domain's `defaultRole`. Otherwise
 *      reject — bootstrap remains passkey-only, so we never create an
 *      admin via OAuth here even on a fresh deploy.
 */
export async function resolveOAuthUser(
  db: Db,
  input: ResolveOAuthUserInput,
): Promise<ResolvedOAuthUser> {
  const { provider, profile } = input;

  const existingLink = await db.query.oauthAccounts.findFirst({
    where: and(
      eq(oauthAccounts.provider, provider),
      eq(oauthAccounts.providerAccountId, profile.providerAccountId),
    ),
  });
  if (existingLink) {
    const linked = await db.query.users.findFirst({
      where: eq(users.id, existingLink.userId),
    });
    if (!linked) {
      // The OAuth row is dangling — likely raced with a user delete that
      // didn't cascade. Treat as a hard error rather than silently
      // re-provisioning a new admin under the same provider id.
      throw new OAuthError("account_disabled");
    }
    if (linked.disabledAt) throw new OAuthError("account_disabled");
    return { user: linked, created: false, linked: false };
  }

  const existingByEmail = await db.query.users.findFirst({
    where: eq(users.email, profile.email),
  });
  if (existingByEmail) {
    if (!profile.emailVerified) {
      // Provider didn't assert verification of this email. Auto-linking
      // here would let an attacker who registers $victim@gmail.com on a
      // throwaway provider take over the local account.
      throw new OAuthError("email_unverified");
    }
    if (existingByEmail.disabledAt) throw new OAuthError("account_disabled");
    await db.insert(oauthAccounts).values({
      provider,
      providerAccountId: profile.providerAccountId,
      userId: existingByEmail.id,
    });
    return { user: existingByEmail, created: false, linked: true };
  }

  if (!profile.emailVerified) {
    throw new OAuthError("email_unverified");
  }

  const domain = extractDomain(profile.email);
  if (!domain) throw new OAuthError("domain_not_allowed");

  const allowed = await db.query.allowedDomains.findFirst({
    where: eq(allowedDomains.domain, domain),
  });
  if (!allowed?.isEnabled) {
    throw new OAuthError("domain_not_allowed");
  }

  // Bootstrap path is passkey-only. Refuse OAuth signup when the system
  // has no users — otherwise a misconfigured `allowed_domains` row would
  // mint an admin via a third-party provider. This is a soft rail; the
  // route layer also pre-checks user count to render a friendlier flow.
  const userCount = await db.$count(users);
  if (userCount === 0) throw new OAuthError("registration_closed");

  const role: UserRole = allowed.defaultRole;
  const [user] = await db
    .insert(users)
    .values({
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      role,
      emailVerifiedAt: new Date(),
    })
    .returning();
  if (!user) throw new Error("resolveOAuthUser: insert returned no row");

  await db.insert(oauthAccounts).values({
    provider,
    providerAccountId: profile.providerAccountId,
    userId: user.id,
  });

  return { user, created: true, linked: false };
}

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}
