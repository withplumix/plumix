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

/** `send` must throw on failure so the caller can react. */
export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

/**
 * A resolver form exists because on Workers the API key lives only in the
 * per-request `env`; resolution is memoized.
 */
export type MailerInput = EnvInput<Mailer>;
