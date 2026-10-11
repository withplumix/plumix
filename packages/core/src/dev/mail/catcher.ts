import type { Mailer } from "../../auth/contract/mailer.js";
import type { Logger } from "../../context/app-context.js";
import type { DevRuntime } from "../../context/dev-runtime.js";
import type { TelemetryCollector } from "../../context/telemetry.js";
import type { JsonValue } from "../../json.js";
import type { SentMail } from "../../mail/sender.js";
import { consoleMailer } from "../../auth/mailer/console.js";
import { DEBUG_MAIL_PANEL_ID } from "./path.js";

interface DevMailInput {
  readonly dev: DevRuntime;
  /** The site's own mailer, when it configures one. */
  readonly configured: Mailer | undefined;
  readonly logger: Logger;
  readonly telemetry: () => TelemetryCollector;
}

interface DevMail {
  /** The configured mailer, else one that logs instead of sending. */
  readonly mailer: Mailer;
  /** Records a sent mail in the request's history, and keeps a caught one. */
  readonly onSent: (sent: SentMail) => void;
}

/** Call only under the `PLUMIX_DEV` gate. */
export function devMail(input: DevMailInput): DevMail {
  const { dev, configured } = input;
  return {
    mailer: configured ?? consoleMailer({ logger: input.logger }),
    onSent: ({ name, props, locale, message }) => {
      // Props are whatever the mail declared; the history store sanitizes
      // each snapshot into JSON, so a `Date` or a class instance is safe here.
      const recorded = { name, locale, props: props as JsonValue, ...message };
      input.telemetry().record(DEBUG_MAIL_PANEL_ID, recorded);
      if (configured === undefined) {
        dev.mail.save({ id: crypto.randomUUID(), at: Date.now(), ...recorded });
      }
    },
  };
}
