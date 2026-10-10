import type { Db, Logger } from "../../context/app-context.js";
import type { User } from "../../db/schema/users.js";
import type { MailSender } from "../../mail/contract/registry.js";
import { and, eq, ne } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
import { generateToken, hashToken } from "../tokens.js";
import { EmailChangeError } from "./errors.js";

/**
 * Far longer than magic-link's: the user may not reach the new mailbox for
 * hours.
 */
const EMAIL_CHANGE_TTL_SECONDS = 24 * 60 * 60;

export interface RequestEmailChangeInput {
  /** The user whose email is changing. Self or admin-driven. */
  readonly userId: number;
  /**
   * The new email to verify. Already lowercase + valibot-trimmed by the caller.
   */
  readonly newEmail: string;
  /** `${origin}/_plumix/auth/verify-email?token=…` for the recipient. */
  readonly origin: string;
  /**
   * Sends core's `emailChange` mail, in the user's stored locale rather than
   * the actor's: an admin in English changing a German user's email mails
   * the German user in German.
   */
  readonly mail: MailSender;
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
  /**
   * The user row read at request time, used by the caller for the hook payload.
   */
  readonly user: User;
  /** Server-side only; the token surfaces to the user via email. */
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Replaces any pending request for the user. Sessions are invalidated only at
 * verify, once the email actually changes, so cancelling stays harmless.
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
    await input.mail.send(
      "emailChange",
      {
        url: verifyUrl.toString(),
        oldEmail: user.email,
        newEmail,
        ttlSeconds,
      },
      // The user, at the address they are moving to.
      { to: { email: newEmail, meta: user.meta } },
    );
  } catch (error) {
    // Don't leak transport failures to the caller — the request still
    // succeeded persistence-wise. The user can re-request if the email
    // never arrives. Log so operators see broken-mail-config failures.
    input.logger?.warn("email_change_mailer_failed", { error });
  }

  return { user, token, expiresAt };
}
