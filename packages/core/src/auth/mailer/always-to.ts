import * as v from "valibot";

import type { PlumixEnv } from "../../runtime/contract/bindings.js";
import type { EnvInput } from "../../runtime/contract/env-input.js";
import type { Mailer, MailerInput } from "../contract/mailer.js";
import { ConfigError } from "../../config.errors.js";
import { escapeHtml } from "../../escape-html.js";
import { resolveEnvInput } from "../../runtime/contract/env-input.js";

const EMAIL = v.pipe(v.string(), v.email());

/**
 * For a staging site with real data: every message goes to `to`. An
 * `EmailMessage` carries no headers, so the original recipient is named at the
 * top of the body instead.
 */
export function alwaysTo(
  to: EnvInput<string>,
  transport: MailerInput,
): MailerInput {
  return (env: PlumixEnv): Mailer => {
    const address = resolveEnvInput(to, env);
    if (!v.is(EMAIL, address)) {
      throw ConfigError.alwaysToInvalidAddress(address);
    }
    const mailer = resolveEnvInput(transport, env);
    return {
      send(message) {
        const original = `Originally to: ${message.to}`;
        return mailer.send({
          ...message,
          to: address,
          text: `${original}\n\n${message.text}`,
          ...(message.html === undefined
            ? {}
            : {
                html:
                  `<p style="font-size:12px;color:#666">${escapeHtml(original)}</p>` +
                  message.html,
              }),
        });
      },
    };
  };
}
