import type { Db } from "../../context/app-context.js";
import type { User } from "../../db/schema/users.js";
import { and, eq, isNull, isUniqueConstraintError } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { sessions } from "../../db/schema/sessions.js";
import { users } from "../../db/schema/users.js";
import { hashToken } from "../tokens.js";
import { EmailChangeError } from "./errors.js";

export interface VerifyEmailChangeResult {
  /** The user row post-commit (new email, fresh `emailVerifiedAt`). */
  readonly user: User;
  /**
   * What the email used to be — passed through to the `user:email_changed`
   * hook.
   */
  readonly previousEmail: string;
}

/**
 * Invalidates all the user's sessions, so a hijacked session that requested the
 * change loses access. Throws `EmailChangeError`; `email_taken` means the
 * address was claimed after the request.
 */
export async function verifyEmailChange(
  db: Db,
  rawToken: string,
): Promise<VerifyEmailChangeResult> {
  const hash = await hashToken(rawToken);

  const [tokenRow] = await db
    .delete(authTokens)
    .where(
      and(eq(authTokens.hash, hash), eq(authTokens.type, "email_verification")),
    )
    .returning();

  if (!tokenRow) throw EmailChangeError.tokenInvalid();
  if (tokenRow.expiresAt.getTime() < Date.now()) {
    throw EmailChangeError.tokenExpired();
  }
  if (tokenRow.userId === null || tokenRow.email === null) {
    // Defensive: every email_verification row written by
    // `requestEmailChange` sets both. A null here means hand-rolled
    // DB state.
    throw EmailChangeError.tokenInvalid();
  }

  // Look up the previous email for the hook payload. The atomic
  // commit guard is on the UPDATE itself, not this read — see below.
  const target = await db.query.users.findFirst({
    where: eq(users.id, tokenRow.userId),
  });
  if (!target) throw EmailChangeError.userNotFound();

  let updated: User;
  try {
    // `disabledAt IS NULL` in the WHERE, so a disable between the read and the
    // write can't slip a commit through.
    const [row] = await db
      .update(users)
      .set({ email: tokenRow.email, emailVerifiedAt: new Date() })
      .where(and(eq(users.id, target.id), isNull(users.disabledAt)))
      .returning();
    if (!row) throw EmailChangeError.accountDisabled();
    updated = row;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw EmailChangeError.emailTaken();
    }
    throw error;
  }

  // Every cached AuthenticatedUser carries the stale email.
  await db.delete(sessions).where(eq(sessions.userId, target.id));

  return { user: updated, previousEmail: target.email };
}
