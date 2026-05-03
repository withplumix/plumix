import type { Db } from "../../context/app.js";
import type { User } from "../../db/schema/users.js";
import type { OAuthProfile } from "./types.js";
import { and, eq, isUniqueConstraintError } from "../../db/index.js";
import { oauthAccounts } from "../../db/schema/oauth_accounts.js";
import { users } from "../../db/schema/users.js";
import { ExternalIdentityError, resolveExternalIdentity } from "../identity.js";
import { OAuthError } from "./errors.js";

interface ResolveOAuthUserInput {
  readonly provider: string;
  readonly profile: OAuthProfile;
  /**
   * When true, allow this OAuth callback to mint the very first admin
   * (forwarded to `resolveExternalIdentity`). The route handler reads
   * this from `ctx.bootstrapAllowed`, which is derived from
   * `auth.bootstrapVia`. Default false keeps the bootstrap rail
   * passkey-only.
   */
  readonly bootstrapAllowed?: boolean;
}

interface ResolvedOAuthUser {
  readonly user: User;
  /** True when this call provisioned a new user row. */
  readonly created: boolean;
  /** True when this call linked an existing user to the OAuth account. */
  readonly linked: boolean;
}

/**
 * Decide who an OAuth callback maps to:
 *
 *   1. If `oauth_accounts(provider, providerAccountId)` already points
 *      at a user, that's the answer (modulo disabled / dangling-link).
 *   2. Else delegate to `resolveExternalIdentity` for the lookup-or-
 *      provision dance shared with magic-link signup. On success, write
 *      the `oauth_accounts` link row.
 *
 * OAuth-specific concerns (link table, dangling-link detection) stay
 * here. The generic identity-resolution logic (verified-email gate,
 * disabled-account gate, allowed-domains gate, bootstrap rail, race-on-
 * insert retry) lives in `auth/identity.ts` and is shared with every
 * external flow.
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
    // A dangling oauth_accounts row means the cascade-on-delete didn't
    // fire (FK enforcement off, or hand-rolled SQL). Surface a distinct
    // code so the friendly-message map can say "support" rather than
    // "your account is disabled" — the row is gone, not paused.
    if (!linked) throw new OAuthError("link_broken");
    if (linked.disabledAt) throw new OAuthError("account_disabled");
    return { user: linked, created: false, linked: false };
  }

  let resolved;
  try {
    resolved = await resolveExternalIdentity(db, {
      email: profile.email,
      emailVerified: profile.emailVerified,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      bootstrapAllowed: input.bootstrapAllowed,
      // allowed_domains still gates signup; the `oauth_accounts` link
      // row is OAuth-specific and written below regardless of whether
      // the user existed or was just provisioned.
    });
  } catch (error) {
    if (error instanceof ExternalIdentityError) {
      throw new OAuthError(error.code);
    }
    throw error;
  }

  // Write the OAuth link row. Race retry is its own concern: a
  // concurrent OAuth callback for the same `(provider, providerAccountId)`
  // could fire between our `existingLink` check and this insert.
  try {
    await db.insert(oauthAccounts).values({
      provider,
      providerAccountId: profile.providerAccountId,
      userId: resolved.user.id,
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    // Another callback won the race; the link already exists pointing
    // at the same userId (provider + providerAccountId is the PK and
    // resolveExternalIdentity returned the same email-keyed user).
    // Fall through — sign-in succeeds.
  }

  return {
    user: resolved.user,
    created: resolved.created,
    linked: !resolved.created,
  };
}
