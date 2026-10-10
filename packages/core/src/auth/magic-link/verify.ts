import type { Db } from "../../context/app-context.js";
import type { User } from "../../db/schema/users.js";
import type { JsonObject } from "../../json.js";
import type { PlumixSelfSignupConfig } from "../config.js";
import { and, eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
import { ExternalIdentityError, resolveExternalIdentity } from "../identity.js";
import { hashToken } from "../tokens.js";
import { MagicLinkError } from "./errors.js";

interface VerifyMagicLinkOptions {
  readonly bootstrapAllowed?: boolean;
  readonly selfSignup?: PlumixSelfSignupConfig;
  readonly meta: JsonObject;
}

interface VerifyMagicLinkResult {
  readonly user: User;
  readonly created: boolean;
}

/**
 * Consumes the token atomically, so a concurrent second verify throws
 * `tokenInvalid`.
 */
export async function verifyMagicLink(
  db: Db,
  rawToken: string,
  options: VerifyMagicLinkOptions,
): Promise<VerifyMagicLinkResult> {
  const hash = await hashToken(rawToken);

  const [row] = await db
    .delete(authTokens)
    .where(and(eq(authTokens.hash, hash), eq(authTokens.type, "magic_link")))
    .returning();

  if (!row) throw MagicLinkError.tokenInvalid();
  if (row.expiresAt.getTime() < Date.now()) {
    throw MagicLinkError.tokenExpired();
  }
  if (row.email === null) {
    // Defensive: every magic_link row written by `requestMagicLink`
    // sets email. A null here means hand-rolled DB state.
    throw MagicLinkError.tokenInvalid();
  }

  if (row.userId !== null) {
    const user = await resolveExistingUser(db, row.userId);
    return { user, created: false };
  }

  try {
    const { user, created } = await resolveExternalIdentity(db, {
      email: row.email,
      emailVerified: true, // link click is the verification
      bootstrapAllowed: options.bootstrapAllowed,
      allowedDomainsGate: options.selfSignup === undefined,
      defaultRole: options.selfSignup?.defaultRole,
      meta: options.meta,
    });
    return { user, created };
  } catch (error) {
    if (error instanceof ExternalIdentityError) {
      switch (error.code) {
        case "email_unverified":
          // Can't fire here (we always pass emailVerified: true);
          // re-throw as-is to surface the programming error if it ever does.
          throw error;
        case "account_disabled":
          throw MagicLinkError.accountDisabled();
        case "domain_not_allowed":
          throw MagicLinkError.domainNotAllowed();
        case "registration_closed":
          throw MagicLinkError.registrationClosed();
      }
    }
    throw error;
  }
}

async function resolveExistingUser(db: Db, userId: number): Promise<User> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) throw MagicLinkError.tokenInvalid();
  if (user.disabledAt) throw MagicLinkError.accountDisabled();
  return user;
}
