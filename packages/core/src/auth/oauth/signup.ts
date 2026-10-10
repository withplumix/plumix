import type { Db } from "../../context/app-context.js";
import type { User } from "../../db/schema/users.js";
import type { JsonObject } from "../../json.js";
import type { PlumixSelfSignupConfig } from "../config.js";
import type { OAuthProfile } from "../contract/oauth.js";
import { and, eq, isUniqueConstraintError } from "../../db/index.js";
import { oauthAccounts } from "../../db/schema/oauth_accounts.js";
import { users } from "../../db/schema/users.js";
import { ExternalIdentityError, resolveExternalIdentity } from "../identity.js";
import { OAuthError } from "./errors.js";

interface ResolveOAuthUserInput {
  readonly provider: string;
  readonly profile: OAuthProfile;
  readonly bootstrapAllowed?: boolean;
  readonly selfSignup?: PlumixSelfSignupConfig;
  readonly meta: JsonObject;
}

interface ResolvedOAuthUser {
  readonly user: User;
  readonly created: boolean;
  readonly linked: boolean;
}

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
    // The cascade didn't fire; a distinct code tells the user to contact
    // support, not that they're disabled.
    if (!linked) throw OAuthError.linkBroken();
    if (linked.disabledAt) throw OAuthError.accountDisabled();
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
      allowedDomainsGate: input.selfSignup === undefined,
      defaultRole: input.selfSignup?.defaultRole,
      meta: input.meta,
    });
  } catch (error) {
    if (error instanceof ExternalIdentityError) {
      switch (error.code) {
        case "email_unverified":
          throw OAuthError.emailUnverified();
        case "account_disabled":
          throw OAuthError.accountDisabled();
        case "domain_not_allowed":
          throw OAuthError.domainNotAllowed();
        case "registration_closed":
          throw OAuthError.registrationClosed();
      }
    }
    throw error;
  }

  // A concurrent callback for the same account can insert between the
  // `existingLink` check and here.
  try {
    await db.insert(oauthAccounts).values({
      provider,
      providerAccountId: profile.providerAccountId,
      userId: resolved.user.id,
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    // The winner linked the same email-keyed user, so sign-in still succeeds.
  }

  return {
    user: resolved.user,
    created: resolved.created,
    linked: !resolved.created,
  };
}
