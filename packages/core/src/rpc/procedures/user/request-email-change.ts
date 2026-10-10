import {
  EmailChangeError,
  requestEmailChange,
} from "../../../auth/email-change/index.js";
import { eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { userRequestEmailChangeInputSchema } from "./schemas.js";

const EDIT_OWN_CAPABILITY = "user:edit_own";
const EDIT_CAPABILITY = "user:edit";

/**
 * The new email commits only when the link sent to it is clicked. Missing
 * mailer config is CONFLICT `mailer_not_configured`; 503 belongs to the route
 * layer.
 */
export const requestEmailChangeProc = base
  .use(authenticated)
  .input(userRequestEmailChangeInputSchema)
  .handler(async ({ input, context, errors }) => {
    const isSelf = input.id === context.user.id;
    const capability = isSelf ? EDIT_OWN_CAPABILITY : EDIT_CAPABILITY;
    if (!context.auth.can(capability)) {
      throw errors.FORBIDDEN({ data: { capability } });
    }

    const target = await context.db.query.users.findFirst({
      where: eq(users.id, input.id),
    });
    if (!target) {
      throw errors.NOT_FOUND({ data: { kind: "user", id: input.id } });
    }

    // Email change reuses the magic-link mailer and site name; `plumix()` pins
    // the two configs together.
    if (!context.mailer || !context.config.auth.magicLink) {
      throw errors.CONFLICT({ data: { reason: "mailer_not_configured" } });
    }

    try {
      const result = await requestEmailChange(context.db, {
        userId: target.id,
        newEmail: input.newEmail,
        origin: context.origin,
        mail: context.mail,
        logger: context.logger,
      });

      await context.hooks.doAction(
        "user:email_change_requested",
        result.user,
        {
          actor: context.user,
          newEmail: input.newEmail.trim().toLowerCase(),
          expiresAt: result.expiresAt,
        },
        context,
      );

      return { ok: true as const, expiresAt: result.expiresAt };
    } catch (error) {
      if (error instanceof EmailChangeError) {
        if (error.code === "email_taken") {
          throw errors.CONFLICT({ data: { reason: "email_taken" } });
        }
        if (error.code === "account_disabled") {
          throw errors.CONFLICT({ data: { reason: "account_disabled" } });
        }
        if (error.code === "user_not_found") {
          throw errors.NOT_FOUND({ data: { kind: "user", id: input.id } });
        }
      }
      throw error;
    }
  });
