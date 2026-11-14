import type { PlumixConfig } from "../config.js";
import { ConfigError } from "../config.errors.js";

/**
 * Throws `magic_link_requires_mailer` when the site signs in by magic link but
 * has no mailer to send the link with.
 */
export function assertMagicLinkHasMailer(
  config: Pick<PlumixConfig, "auth" | "mailer">,
): void {
  if (config.auth.magicLink && !config.mailer) {
    throw ConfigError.magicLinkRequiresMailer();
  }
}
