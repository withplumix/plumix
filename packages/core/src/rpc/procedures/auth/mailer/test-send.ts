import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { mailerTestSendInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";

// Operator sanity check: send a one-shot test email through the
// configured mailer adapter. Used post-deploy to confirm the magic-link
// flow will actually deliver. Distinct from the magic-link request
// path — that one swallows mailer failures (always-success contract);
// this one reports the mailer's error verbatim so the operator can
// debug the adapter.
//
// Capability-gated to `settings:manage` (admin-equivalent in the
// default RBAC) — the recipient is operator-supplied input, so we
// don't want every authed user able to fire emails.
export const testSend = base
  .use(authenticated)
  .input(mailerTestSendInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }
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
