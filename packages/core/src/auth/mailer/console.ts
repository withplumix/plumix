import type { Logger } from "../../context/app.js";
import type { EmailMessage, Mailer } from "./types.js";

interface ConsoleMailerOptions {
  /**
   * Logger to write the message through. Defaults to `console`. Pass
   * the request `Logger` from a route handler when you want the
   * message to appear with the rest of that request's structured logs.
   */
  readonly logger?: Pick<Logger, "info">;
}

/**
 * Dev-only mailer that logs each outgoing message instead of sending.
 * Intended for local development and tests — there's no hidden network
 * call and no rate-limit. Production deploys should pass a real
 * `Mailer` (Resend, Postmark, SES, SMTP, …).
 *
 * The full message body is dumped at `info` level so the operator can
 * copy the magic-link URL out of the logs during local sign-in.
 */
export function consoleMailer(options: ConsoleMailerOptions = {}): Mailer {
  const logger = options.logger ?? console;
  return {
    send(message: EmailMessage): Promise<void> {
      logger.info("[mailer:console]", {
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }),
      });
      return Promise.resolve();
    },
  };
}
