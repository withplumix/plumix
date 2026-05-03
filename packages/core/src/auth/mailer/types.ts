/**
 * Outbound email message — the payload `Mailer.send` is invoked with.
 * Plain text required; HTML optional. Subject + recipient are the two
 * routing-relevant fields.
 */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/**
 * Pluggable outbound-email transport. Plumix needs this exactly when
 * an auth feature wants to send mail (magic-link today; email-verify,
 * invite-email, password-reset later). Implementations can wrap any
 * provider — Resend, Postmark, SES, SMTP, a queue. Core never knows.
 *
 * The contract is one method, fail-fast: throw on send failure so the
 * caller can react (the magic-link flow swallows + logs to avoid
 * leaking whether the recipient is registered).
 */
export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}
