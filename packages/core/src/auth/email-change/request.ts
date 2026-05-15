import type { Db, Logger } from "../../context/app.js";
import type { User } from "../../db/schema/users.js";
import type { Mailer } from "../mailer/types.js";
import { and, eq, ne } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
import { generateToken, hashToken } from "../tokens.js";
import { EmailChangeError } from "./errors.js";

// 24-hour TTL — the link goes to the user's *new* mailbox, which they
// may need a few hours to access (corporate inboxes, password managers,
// MX delays, etc.). Magic-link uses 15 minutes because that's a sign-in
// where the user is at-keyboard waiting for the email; an email change
// is async — the human submits, lives life, opens the email later.
const EMAIL_CHANGE_TTL_SECONDS = 24 * 60 * 60;

export interface RequestEmailChangeInput {
  /** The user whose email is changing. Self or admin-driven. */
  readonly userId: number;
  /** The new email to verify. Already lowercase + valibot-trimmed by the caller. */
  readonly newEmail: string;
  /** `${origin}/_plumix/auth/verify-email?token=…` for the recipient. */
  readonly origin: string;
  readonly mailer: Mailer;
  readonly siteName: string;
  readonly ttlSeconds?: number;
  /**
   * Optional logger for swallowed mailer errors. Same rationale as
   * magic-link: never throw out of the request — the verification
   * outcome is async — but log so a broken transport is operator-
   * visible.
   */
  readonly logger?: Pick<Logger, "warn">;
}

export interface RequestEmailChangeResult {
  /** The user row read at request time, used by the caller for the hook payload. */
  readonly user: User;
  /** Server-side only; the token surfaces to the user via email. */
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Persist a pending email-change verification + send the confirmation
 * mail to the *new* address. Mirrors WordPress's
 * `send_confirmation_on_profile_email()` but harder:
 *
 *   - Token is hashed at rest (WP stores plaintext in user_meta).
 *   - Single in-flight request per user — older pending tokens are
 *     deleted before the new one lands. Avoids "I clicked the wrong
 *     link" confusion when the user requests twice.
 *   - Pre-checks email uniqueness so we don't bother mailing a doomed
 *     verification. The DB unique constraint is the authoritative
 *     guard at commit time (see verify.ts).
 *
 * The verify route resolves the user via the token's `userId`, so a
 * stolen request token without the matching user is harmless. Sessions
 * are NOT invalidated here — they're invalidated at the verify step,
 * after the email actually changes (cancelling on the *request* would
 * make the cancel button a footgun).
 */
export async function requestEmailChange(
  db: Db,
  input: RequestEmailChangeInput,
): Promise<RequestEmailChangeResult> {
  const newEmail = input.newEmail.trim().toLowerCase();
  const ttlSeconds = input.ttlSeconds ?? EMAIL_CHANGE_TTL_SECONDS;

  const user = await db.query.users.findFirst({
    where: eq(users.id, input.userId),
  });
  if (!user) throw EmailChangeError.userNotFound();
  if (user.disabledAt) throw EmailChangeError.accountDisabled();

  // Pre-check uniqueness against any *other* user's email. Same-self
  // re-request (newEmail === current) is rejected as `email_taken`
  // for symmetry — there's nothing to verify.
  if (newEmail === user.email) {
    throw EmailChangeError.emailTaken();
  }
  const collision = await db.query.users.findFirst({
    where: and(eq(users.email, newEmail), ne(users.id, user.id)),
  });
  if (collision) throw EmailChangeError.emailTaken();

  // Single in-flight request per user — purge any prior pending
  // change before issuing the new one. Caller's previous link
  // becomes invalid.
  await db
    .delete(authTokens)
    .where(
      and(
        eq(authTokens.type, "email_verification"),
        eq(authTokens.userId, user.id),
      ),
    );

  const token = generateToken();
  const hash = await hashToken(token);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await db.insert(authTokens).values({
    hash,
    userId: user.id,
    email: newEmail,
    type: "email_verification",
    expiresAt,
  });

  const verifyUrl = new URL("/_plumix/auth/verify-email", input.origin);
  verifyUrl.searchParams.set("token", token);

  try {
    await input.mailer.send({
      to: newEmail,
      subject: `Confirm your new email for ${input.siteName}`,
      text: composeText(
        input.siteName,
        user.email,
        newEmail,
        verifyUrl.toString(),
        ttlSeconds,
      ),
    });
  } catch (error) {
    // Don't leak transport failures to the caller — the request still
    // succeeded persistence-wise. The user can re-request if the email
    // never arrives. Log so operators see broken-mail-config failures.
    input.logger?.warn("email_change_mailer_failed", { error });
  }

  return { user, token, expiresAt };
}

function composeText(
  siteName: string,
  oldEmail: string,
  newEmail: string,
  url: string,
  ttlSeconds: number,
): string {
  return [
    `Someone — hopefully you — asked to change the email on your ${siteName} account.`,
    "",
    `From: ${oldEmail}`,
    `To:   ${newEmail}`,
    "",
    `Confirm the change by opening this link:`,
    "",
    url,
    "",
    `The link expires in ${Math.round(ttlSeconds / 3600)} hour(s).`,
    "",
    `If you didn't request this, you can ignore this email — your account stays on ${oldEmail}.`,
  ].join("\n");
}
