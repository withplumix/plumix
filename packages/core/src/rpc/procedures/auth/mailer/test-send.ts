import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { requireCapability } from "../../../require-capability.js";
import { mailerTestSendInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";

/**
 * Unlike the magic-link path, which swallows mailer failures, this reports
 * the mailer's error verbatim. Gated because the recipient is caller input.
 */
export const testSend = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(mailerTestSendInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.mailer) {
      throw errors.CONFLICT({ data: { reason: "mailer_not_configured" } });
    }

    try {
      await context.mailer.send({
        to: input.to,
        subject: "Plumix mailer test",
        text:
          `This is a test message from Plumix.\n` +
          `\n` +
          `If you can read this, your mailer adapter is wired up correctly ` +
          `and magic-link sign-in / invite emails will reach recipients.\n`,
      });
    } catch (err) {
      // Surface the underlying error so the operator can debug their
      // adapter — distinct from the magic-link request flow which
      // intentionally swallows for the always-success contract.
      context.logger.warn("mailer_test_send_failed", { error: err });
      throw errors.CONFLICT({ data: { reason: "mailer_send_failed" } });
    }
    return { ok: true as const };
  });
