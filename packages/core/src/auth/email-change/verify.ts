import type { Db } from "../../context/app-context.js";
import type { AuthTokenType } from "../../db/schema/auth_tokens.js";
import type { User } from "../../db/schema/users.js";
import { now } from "../../clock.js";
import { runBatch } from "../../db/batch.js";
import {
  and,
  eq,
  inArray,
  isNull,
  isUniqueConstraintError,
} from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { sessions } from "../../db/schema/sessions.js";
import { users } from "../../db/schema/users.js";
import { hashToken } from "../tokens.js";
import { EmailChangeError } from "./errors.js";

export interface VerifyEmailChangeResult {
  /** The user row post-commit (new email, fresh `emailVerifiedAt`). */
  readonly user: User;
  readonly previousEmail: string;
}

/**
 * Token types that sign their holder in, or enrol a credential, as `userId`.
 * They were issued while the user held the old address.
 */
const SIGN_IN_TOKEN_TYPES = [
  "magic_link",
  "invite",
  "webauthn_challenge",
] as const satisfies readonly AuthTokenType[];

/**
 * Revokes the user's sessions and sign-in tokens, so a hijacked session that
 * requested the change loses access. Throws `EmailChangeError`; `email_taken`
 * means the address was claimed after the request.
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
  if (tokenRow.expiresAt.getTime() < now().getTime()) {
    throw EmailChangeError.tokenExpired();
  }
  if (tokenRow.userId === null || tokenRow.email === null) {
    // Defensive: every email_verification row written by
    // `requestEmailChange` sets both. A null here means hand-rolled
    // DB state.
    throw EmailChangeError.tokenInvalid();
  }

  // Look up the previous email for the event payload. The atomic
  // commit guard is on the UPDATE itself, not this read — see below.
  const target = await db.query.users.findFirst({
    where: eq(users.id, tokenRow.userId),
  });
  if (!target) throw EmailChangeError.userNotFound();

  // The revocations land only with the commit: each delete matches only once
  // the user holds the new address.
  const committed = db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, target.id), eq(users.email, tokenRow.email)));

  let updated: User;
  try {
    // `disabledAt IS NULL` in the WHERE, so a disable between the read and the
    // write can't slip a commit through.
    const [[row]] = await runBatch(db, [
      db
        .update(users)
        .set({ email: tokenRow.email, emailVerifiedAt: now() })
        .where(and(eq(users.id, target.id), isNull(users.disabledAt)))
        .returning(),
      // Every cached AuthenticatedUser carries the stale email.
      db.delete(sessions).where(inArray(sessions.userId, committed)),
      db
        .delete(authTokens)
        .where(
          and(
            inArray(authTokens.userId, committed),
            inArray(authTokens.type, SIGN_IN_TOKEN_TYPES),
          ),
        ),
    ]);
    if (!row) throw EmailChangeError.accountDisabled();
    updated = row;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw EmailChangeError.emailTaken();
    }
    throw error;
  }

  return { user: updated, previousEmail: target.email };
}
