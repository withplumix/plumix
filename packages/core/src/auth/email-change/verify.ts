import type { Db } from "../../context/app.js";
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
  /** What the email used to be — passed through to the `user:email_changed` hook. */
  readonly previousEmail: string;
}

/**
 * Consume an email-change verification token and commit the change
 * atomically. Mirrors `verifyMagicLink`'s atomic compare-and-delete
 * shape — a concurrent second click can't double-commit.
 *
 * On success:
 *   - users.email = the row's stored newEmail
 *   - users.emailVerifiedAt = now (the click is the verification)
 *   - all sessions for the user are invalidated (security: an
 *     attacker holding a hijacked session that triggered the change
 *     loses access at commit time)
 *   - the verification token row is gone
 *
 * Errors:
 *   - `token_invalid` — unknown token, wrong type, or already consumed
 *   - `token_expired` — past TTL
 *   - `email_taken` — racey commit, the new email got taken between
 *     request-time pre-check and now (DB unique-constraint)
 *   - `account_disabled` — user was disabled after request was issued
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
    // Atomic guard: pin `disabledAt IS NULL` into the WHERE clause so
    // an admin disabling the account between the read and the write
    // can't slip a commit through. Zero rows updated → either the
    // user vanished or got disabled mid-flight; both surface as
    // `account_disabled` (no point distinguishing — the token is
    // already consumed and the response is "you can't do this").
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

  // Invalidate every session for this user — the new email is now
  // canonical, any cached AuthenticatedUser carries the stale email.
  // Forces every device to re-authenticate; magic-link / OAuth flows
  // resolve to the new email automatically.
  await db.delete(sessions).where(eq(sessions.userId, target.id));

  return { user: updated, previousEmail: target.email };
}
