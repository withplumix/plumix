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

// Initiate an email change for a user. The new email is NOT committed
// yet — a confirmation link goes to the *new* address; only the click
// commits. See `auth/email-change/request.ts` for the rationale, and
// `verify-email` route for the commit-side.
//
// Authorization:
//   - self  (id === ctx.user.id): require `user:edit_own`
//   - other (id !== ctx.user.id): require `user:edit`
//
// Mailer + magic-link config gate: the same `auth.magicLink` block
// that wires the magic-link site name + mailer is required here so
// the verification email can address the user with the same site
// branding. If `magicLink` isn't configured the procedure returns
// CONFLICT/mailer_not_configured rather than 503 — RPC layer
// distinguishes "not implemented" (FORBIDDEN with a config-hint
// reason is wrong) from "operator config missing" (CONFLICT is the
// right shape; 503 lives at the route layer).
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

    // Email change reuses the magic-link mailer + siteName config —
    // operators that disable magic-link (no top-level mailer) also
    // disable email change. The cross-field check in `plumix()` pins
    // these together; context surfaces both as `mailer` + `siteName`.
    if (!context.mailer || !context.siteName) {
      throw errors.CONFLICT({ data: { reason: "mailer_not_configured" } });
    }

    try {
      const result = await requestEmailChange(context.db, {
        userId: target.id,
        newEmail: input.newEmail,
        origin: context.origin,
        mailer: context.mailer,
        siteName: context.siteName,
        logger: context.logger,
      });

      await context.hooks.doAction("user:email_change_requested", result.user, {
        actor: context.user,
        newEmail: input.newEmail.trim().toLowerCase(),
        expiresAt: result.expiresAt,
      });

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
