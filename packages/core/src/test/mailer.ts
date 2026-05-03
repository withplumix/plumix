import { vi } from "vitest";

import type { Mailer } from "../auth/mailer/types.js";

interface CapturedMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/**
 * In-memory `Mailer` for tests. Captures every send into `sent` so
 * the test can assert on the recipient / subject / body. Resolves
 * synchronously; throws when `failWith` is set so the caller can
 * exercise transport-failure paths without manually rolling a vi-mock.
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
