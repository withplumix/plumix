import { vi } from "vitest";

import type { Mailer } from "../auth/contract/mailer.js";

interface CapturedMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/**
 * In-memory `Mailer` capturing every send into `sent`; set `failWith` to
 * exercise transport failures.
 */
interface CapturingMailer extends Mailer {
  readonly sent: CapturedMail[];
}

interface MailerOptions {
  /**
   * When provided, `send` returns a rejected promise with the given
   * error instead of capturing. Used to exercise the "swallow mailer
   * failure" branches in magic-link / email-change request flows.
   */
  readonly failWith?: Error;
}

export function makeMailer(options: MailerOptions = {}): CapturingMailer {
  const sent: CapturedMail[] = [];
  return {
    sent,
    send: vi.fn((msg: CapturedMail) => {
      if (options.failWith) return Promise.reject(options.failWith);
      sent.push(msg);
      return Promise.resolve();
    }),
  };
}
