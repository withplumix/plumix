import type { Db } from "../../context/app.js";
import type { User } from "../../db/schema/users.js";
import { and, eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
import { ExternalIdentityError, resolveExternalIdentity } from "../identity.js";
import { hashToken } from "../tokens.js";
import { MagicLinkError } from "./errors.js";

interface VerifyMagicLinkOptions {
  /**
   * When true, allow this magic-link verify to mint the very first
   * admin (forwarded to `resolveExternalIdentity`). The route handler
   * reads this from `ctx.bootstrapAllowed`, derived from
   * `auth.bootstrapVia`. Default false keeps the bootstrap rail
   * passkey-only.
   */
  readonly bootstrapAllowed?: boolean;
}

interface VerifyMagicLinkResult {
  readonly user: User;
  /**
   * True when the click provisioned a brand-new user (signup path);
   * false when the token bound to an existing user (sign-in path).
   * The caller forwards this to `user:signed_in`'s `firstSignIn`
   * field so audit logs and onboarding handlers can branch on
   * first-vs-returning. Mirrors `resolveOAuthUser`'s `created`.
   */
  readonly created: boolean;
}

/**
 * Consume a magic-link token and return the matching user + whether
 * it was just created (signup) or pre-existing (sign-in).
 *
 *   userId set in the token row → sign-in; created=false.
 *   userId null in the token row → signup; created comes from
 *     `resolveExternalIdentity` (true on a fresh row, false when the
 *     helper linked an existing user via verified-email match).
 *
 * Atomic compare-and-delete via `DELETE … RETURNING` — a concurrent
 * second verify of the same token sees an empty result, never the same
 * row twice. Scoped by `type='magic_link'` so a hash collision with
 * another token type can't accidentally consume that row.
 *
 * The link click implicitly verifies that the user has access to the
 * email's inbox — we always pass `emailVerified: true` to the helper.
 */
export async function verifyMagicLink(
  db: Db,
  rawToken: string,
  options: VerifyMagicLinkOptions = {},
): Promise<VerifyMagicLinkResult> {
  const hash = await hashToken(rawToken);

  const [row] = await db
    .delete(authTokens)
    .where(and(eq(authTokens.hash, hash), eq(authTokens.type, "magic_link")))
    .returning();

  if (!row) throw new MagicLinkError("token_invalid");
  if (row.expiresAt.getTime() < Date.now()) {
    throw new MagicLinkError("token_expired");
  }
  if (row.email === null) {
    // Defensive: every magic_link row written by `requestMagicLink`
    // sets email. A null here means hand-rolled DB state.
    throw new MagicLinkError("token_invalid");
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
    });
    return { user, created };
  } catch (error) {
    if (error instanceof ExternalIdentityError) {
      // `email_unverified` can't fire here (we always pass true);
      // re-throw as-is to surface the programming error if it ever
      // does. Other codes map directly to MagicLinkError.
      if (error.code === "email_unverified") throw error;
      throw new MagicLinkError(error.code);
    }
    throw error;
  }
}

async function resolveExistingUser(db: Db, userId: number): Promise<User> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) throw new MagicLinkError("token_invalid");
  if (user.disabledAt) throw new MagicLinkError("account_disabled");
  return user;
}
