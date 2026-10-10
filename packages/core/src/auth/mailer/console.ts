import type { Logger } from "../../context/app-context.js";
import type { EmailMessage, Mailer } from "../contract/mailer.js";

interface ConsoleMailerOptions {
  readonly logger?: Pick<Logger, "info">;
}

/**
 * Dev-only: logs the full message body at `info` instead of sending, so sign-in
 * links can be copied out.
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
