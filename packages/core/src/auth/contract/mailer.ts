import type { EnvInput } from "../../runtime/contract/env-input.js";

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

/**
 * The mailer config slot: a literal {@link Mailer}, or an `(env) => Mailer`
 * resolver for a transport whose API key only exists in the per-request `env`
 * (the Workers case). See {@link EnvInput} for the shared union + the typed
 * `env`; resolution is memoized per resolver.
 */
export type MailerInput = EnvInput<Mailer>;
